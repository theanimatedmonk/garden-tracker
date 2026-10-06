import { Alignment, decodeImage, Fit, Layout, Rive, RuntimeLoader } from "@rive-app/webgl2";
import riveWasmUrl from "@rive-app/webgl2/rive.wasm?url";
import { useEffect, useMemo, useRef, useState } from "react";
import { SpeciesCard } from "./SpeciesCard";

// Serve the runtime from this app rather than a CDN, so the card works on a LAN without internet.
RuntimeLoader.setWasmUrl(riveWasmUrl);

/** Built from ~/Documents/rive-cli/animal-card with `rive rive --publish`. */
const RIV_SRC = "/rive/animal-card.riv";
const HARMONY_COUNT = 5; // 0..4

let rivBytes: Promise<ArrayBuffer> | null = null;

function loadRiv(): Promise<ArrayBuffer> {
  rivBytes ??= fetch(RIV_SRC).then((res) => {
    if (!res.ok) {
      throw new Error(`Could not load ${RIV_SRC}: ${res.status}`);
    }
    return res.arrayBuffer();
  });
  rivBytes.catch(() => {
    rivBytes = null;
  });
  return rivBytes;
}

// Which side each card was left on. Cards start on the back (the print); once flipped to the front a
// card stays there, across swipes, remounts and reloads, until it is flipped back.
const FRONT_KEY = "animalCard.frontSpecies";
// The flip transition in the Card state machine is 600ms.
const RESTORE_FLIP_MS = 700;
// After a new photo, the back's Madhubani print is rebuilt over several frames (the photo is relayed to
// the back, then two GPU passes run). Until then it still shows the file's default print, so the card
// keeps running, even off screen, and stays hidden for this long.
const PRINT_WARMUP_MS = 1000;

const frontSpecies: Set<string> = (() => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(FRONT_KEY) ?? "[]"));
  } catch {
    return new Set<string>();
  }
})();

function rememberSide(species: string, front: boolean) {
  if (front) {
    frontSpecies.add(species);
  } else {
    frontSpecies.delete(species);
  }
  try {
    localStorage.setItem(FRONT_KEY, JSON.stringify([...frontSpecies]));
  } catch {
    /* side is still remembered for this session */
  }
}

/**
 * Colour scheme for a species, like contact avatars: a hash of the name picks one of the schemes,
 * so every bird gets a random-looking palette that is the same on every load and every device.
 * (FNV-1a over the lower-cased name, then a Murmur3 finaliser.)
 */
function harmonyFor(species: string): number {
  let hash = 0x811c9dc5;
  for (const ch of species.trim().toLowerCase()) {
    hash ^= ch.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  // Murmur3 finaliser: FNV alone leaves the low bits poorly mixed for short names, which skews `% 5`.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) % HARMONY_COUNT;
}

/** Plain pale tile so a bird without a photo never shows the file's default Osprey. */
async function placeholderBytes(): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = 300;
  canvas.height = 400;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#eefac4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return new Uint8Array(await blob!.arrayBuffer());
}

async function photoBytes(url: string | null): Promise<Uint8Array> {
  if (url) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return new Uint8Array(await res.arrayBuffer());
      }
    } catch {
      /* fall through to placeholder */
    }
  }
  return placeholderBytes();
}

type Props = {
  species: string;
  scientificName: string | null;
  imageUrl: string | null;
  /** Stop rendering while the Scan tab is hidden. */
  paused?: boolean;
};

/**
 * The AnimalCard Rive artboard, drawn full-bleed behind a Scan reel (see utils/cardLayout),
 * and bound to a species through its view model
 * (AnimalCard > front > photo / birdName / scientificName / harmony).
 * Tap flips the card; pointer movement tilts it.
 */
export function RiveCard({ species, scientificName, imageUrl, paused = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const riveRef = useRef<Rive | null>(null);
  const [ready, setReady] = useState(false);
  const [photoShown, setPhotoShown] = useState(false);
  const [failed, setFailed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [warming, setWarming] = useState(false);
  // Start downloading the photo right away, in parallel with Rive loading, rather than once it is ready.
  const photo = useMemo(() => photoBytes(imageUrl), [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    let disposed = false;
    let instance: Rive | null = null;

    loadRiv()
      .then((buffer) => {
        if (disposed) {
          return;
        }
        instance = new Rive({
          buffer: buffer.slice(0),
          canvas,
          artboard: "AnimalCard",
          stateMachine: "Card",
          autoplay: true,
          autoBind: true,
          enableGPUCanvas: true,
          isTouchScrollEnabled: true,
          layout: new Layout({ fit: Fit.Cover, alignment: Alignment.TopCenter }),
          onLoad: () => {
            if (disposed || !instance) {
              return;
            }
            instance.resizeDrawingSurfaceToCanvas();
            riveRef.current = instance;
            setReady(true);
          },
          onLoadError: () => {
            if (!disposed) {
              setFailed(true);
            }
          },
        });
      })
      .catch(() => {
        if (!disposed) {
          setFailed(true);
        }
      });

    const resize = new ResizeObserver(() => {
      // A hidden tab reports a 0x0 canvas; resizing the drawing surface to that breaks rendering.
      if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        riveRef.current?.resizeDrawingSurfaceToCanvas();
      }
    });
    resize.observe(canvas);

    return () => {
      disposed = true;
      resize.disconnect();
      riveRef.current = null;
      // Rive's WebGL teardown can throw when several canvases share the runtime; an error during
      // unmount would take the whole app down, so contain it. The canvas goes away regardless.
      try {
        instance?.cleanup();
      } catch (err) {
        console.warn("Rive cleanup failed", err);
      }
    };
  }, []);

  useEffect(() => {
    const instance = ready ? riveRef.current : null;
    if (!instance) {
      return;
    }
    // Keep running while a restored flip plays out, even for a card that is off screen.
    if (paused && !restoring && !warming) {
      instance.pause();
    } else {
      instance.play();
    }
  }, [ready, paused, restoring, warming]);

  // Track taps on the card's `flip` trigger to know which side is up, and turn a card that was
  // left on the front back to the front when it remounts (hidden until the turn finishes).
  useEffect(() => {
    const flip = ready ? riveRef.current?.viewModelInstance?.trigger("flip") : null;
    if (!flip) {
      return;
    }
    let showingFront = false;
    let ownFlips = 0;
    const onFlip = () => {
      if (ownFlips > 0) {
        ownFlips -= 1;
        return;
      }
      showingFront = !showingFront;
      rememberSide(species, showingFront);
    };
    flip.on(onFlip);

    let timer: number | undefined;
    if (frontSpecies.has(species)) {
      showingFront = true;
      ownFlips = 1;
      setRestoring(true);
      flip.trigger();
      timer = window.setTimeout(() => {
        ownFlips = 0;
        setRestoring(false);
      }, RESTORE_FLIP_MS);
    }
    return () => {
      window.clearTimeout(timer);
      flip.off(onFlip);
    };
  }, [ready, species]);

  useEffect(() => {
    const front = ready ? riveRef.current?.viewModelInstance?.viewModel("front") : null;
    if (!front) {
      return;
    }
    const name = front.string("birdName");
    if (name) {
      name.value = species;
    }
    const sci = front.string("scientificName");
    if (sci) {
      sci.value = scientificName ?? "";
    }
    const harmony = front.number("harmony");
    if (harmony) {
      harmony.value = harmonyFor(species);
    }
  }, [ready, species, scientificName]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    let cancelled = false;
    let warmTimer: number | undefined;
    const reveal = () => {
      setWarming(false);
      setPhotoShown(true);
    };
    (async () => {
      const image = await decodeImage(await photo).catch(async () =>
        decodeImage(await placeholderBytes()),
      );
      if (cancelled) {
        image.unref();
        return;
      }
      const property = riveRef.current?.viewModelInstance?.viewModel("front")?.image("photo");
      if (property) {
        // decodeImage's wrapper is what the runtime expects here; its typings only name the inner image.
        (property as unknown as { value: unknown }).value = image;
      }
      image.unref();
      setWarming(true);
      warmTimer = window.setTimeout(reveal, PRINT_WARMUP_MS);
    })().catch(reveal);
    return () => {
      cancelled = true;
      window.clearTimeout(warmTimer);
    };
  }, [ready, photo]);

  if (failed) {
    return (
      <div className="card-slot">
        <SpeciesCard species={species} imageUrl={imageUrl} />
      </div>
    );
  }

  return (
    <div className="rive-card">
      <canvas
        ref={canvasRef}
        className={photoShown && !restoring ? "rive-card-canvas is-shown" : "rive-card-canvas"}
        aria-label={`${species} card. Tap to flip.`}
      />
    </div>
  );
}
