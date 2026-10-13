# Connector Local / Private Destination Fix — 12.2.8

The universal connector now supports trusted self-hosted/private APIs without removing SSRF protection entirely.

## Policies

- `public` — blocks localhost, `.local`, RFC1918, loopback, link-local and other private destinations.
- `private` — allows private/local destinations. Intended for trusted self-hosted/on-prem deployments.
- `allowlist` — private/local destinations are permitted only for hosts listed in `CONNECTOR_ALLOWED_PRIVATE_HOSTS`.

The Docker Compose default for this self-hosted package is `private` so local Docker/LAN APIs work out of the box. Hosted deployments should set `CONNECTOR_DESTINATION_POLICY=public` or `allowlist`.

For an API running on the Docker host, use `http://host.docker.internal:<port>` rather than `localhost`, because `localhost` inside the API container refers to the API container itself.
