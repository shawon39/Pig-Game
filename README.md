# 🎲 Pig Game — Modern Dice Duel

A fast, polished, two-player **Pig** dice game. Rebuilt from the ground up with a
modern UI, a real 3D CSS dice, smooth animations, sound, and a full win
celebration — no frameworks, no build step, just clean HTML/CSS/JS.

**▶️ Play it live:** https://shawon39.github.io/Pig-Game/

## How to play

Two players take turns. On your turn:

- **Roll** the dice as many times as you like — each roll adds to your *current* turn total.
- **Hold** to bank your current total into your score and pass the turn.
- Roll a **1** and you *bust*: you lose the current turn total and the turn passes on.

First player to reach the **target score** (default **100**) wins.

## Features

- 🎲 **True 3D dice** rendered entirely in CSS — crisp at any size, no images to load.
- ✨ **Fluid animations** — tumbling dice, animated score counters, active-player glow, bust shake, and a confetti win celebration.
- 🎯 **Adjustable target** score (20–300).
- ✏️ **Editable player names** (click a name to rename).
- 🔊 **Sound effects** via the Web Audio API, with a mute toggle.
- ⌨️ **Keyboard shortcuts** — `R` roll · `H` hold · `N` new game.
- 📱 **Fully responsive** — plays great on phone, tablet, and desktop.
- ♿ **Accessible** — live status updates and reduced-motion support.
- 💾 Remembers names, wins tally, target, and sound preference (localStorage).

## Tech

Plain HTML, CSS, and vanilla JavaScript. Zero dependencies and zero build tooling —
open `index.html` and play.

## Run locally

```bash
git clone https://github.com/shawon39/Pig-Game.git
cd Pig-Game
# open index.html in your browser, or serve it:
python3 -m http.server 8000   # then visit http://localhost:8000
```
