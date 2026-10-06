import { BirdGlyph } from "./Icons";

type Props = {
  species: string;
  imageUrl: string | null;
  size?: "lg" | "sm";
};

/**
 * Collectible card frame. The art area is where the Rive canvas will mount;
 * until then it shows the species photo.
 */
export function SpeciesCard({ species, imageUrl, size = "lg" }: Props) {
  return (
    <figure className={`species-card species-card-${size}`}>
      <div className="species-card-art">
        {imageUrl ? (
          <img src={imageUrl} alt="" loading={size === "sm" ? "lazy" : undefined} />
        ) : (
          <span className="species-card-fallback">
            <BirdGlyph />
          </span>
        )}
      </div>
      {size === "lg" && <figcaption className="species-card-name">{species}</figcaption>}
    </figure>
  );
}
