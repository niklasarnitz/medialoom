# Output Profiles

Profiles own media-server-specific naming and sidecar conventions.

Examples:

* Jellyfin
* Plex
* Kodi
* Emby
* Audiobookshelf

Do not scatter server-specific conditionals through core code.

Profiles may calculate desired paths and metadata but must not directly mutate the filesystem.

All paths derived from metadata must be sanitized.

Profile output is consumed by `OperationPlan` generation.
