# ZeroClaw Plugin
build or start
```bash
    bun install
    bun run build
    bun run start
```
- download zeroclaw
- initialize zeroclaw

```bash
./zeroclaw onboard
# after setup (optional)
./zeroclaw gateway
```
## Quick Setup Methods
### 1. Config File (Recommended)

- Edit `~/.zeroclaw/config.toml`:

```toml
default_provider = "custom:https://your-api.com"  
api_key = "your-api-key"  
default_model = "your-model-name"
```