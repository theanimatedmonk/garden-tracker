from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    host: str = "0.0.0.0"
    port: int = 8000
    data_dir: str = "data"
    ingest_sample_rate: int = 16000
    analysis_window_seconds: float = 3.0
    birdnet_sample_rate: int = 48000
    min_confidence: float = 0.35
    event_cooldown_seconds: int = 300
    use_birdnet: bool = False
    mock_birdnet: bool = True
    birdnet_lat: float = 12.9716
    birdnet_lon: float = 77.5946
    # Human-readable place for the coordinates above (shown when sharing a clip).
    location_name: str = "Bengaluru, Karnataka, India"
    birdnet_use_geo: bool = True
    birdnet_min_conf: float = 0.20
    history_predictions_per_segment: int = 5

    # Phase 5 JEV — optional LLM (Typesafe PAI). Rule-based JEV runs when key is empty.
    jev_mode: str = "rules"
    typesafe_pai_api_key: str = Field(default="", validation_alias="TYPESAFE_API_KEY")
    typesafe_pai_base_url: str = Field(default="", validation_alias="JEV_BASE_URL")
    jev_model: str = "jev-latest"
    jev_surface_threshold: float = 0.55

    # Supabase: history in Postgres, compressed clips in Storage. Leave the URL or key empty to keep
    # history in local JSONL files instead. The secret (service-role) key must stay on the backend.
    supabase_url: str = ""
    supabase_secret_key: str = ""
    supabase_bucket: str = "recordings"

    @property
    def supabase_enabled(self) -> bool:
        return bool(self.supabase_url.strip() and self.supabase_secret_key.strip())


settings = Settings()
