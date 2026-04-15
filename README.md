# Epoch Siege Prototype

A lightweight browser prototype inspired by lane/tug-of-war strategy games (Stick War / Age of War), rebuilt into a 3D battlefield.

## Features
- Half-earth 3D world with camera orbit controls.
- Click-to-deploy units on your side of the map.
- Objective control gameplay over relic sites.
- Unit eras that start at **Caveman** and scale as you level.
- Persistent level, XP, and resources using `localStorage`.

## Run locally
Because this uses ES modules from a CDN, run it through a local web server:

```bash
python3 -m http.server 8000
```

Then open: <http://localhost:8000>

## Gameplay loop
1. Deploy units with the button or by clicking on your side of the hemisphere.
2. Units auto-path toward relic sites.
3. Capturing all relics grants XP and advances progression.
4. AI pressure scales with level.
