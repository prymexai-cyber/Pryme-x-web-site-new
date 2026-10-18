# King Ravana — 3D painting

Your painting, unchanged (same face, same style, same colours), turned into a
real-time 3D scene: the ten heads, the face, the armour, the fists and the sword
each sit at their own depth, and the whole piece turns with the mouse.
On phones it moves gently by itself. Floating fire embers are added in front.

## Try it
Open `index.html` through any web server (e.g. on Netlify or GitHub Pages).
(Opening the file directly from your computer may not load it — browsers block that.)

## Files
ravana3d/ravana3d.js        the 3D viewer
ravana3d/ravana.jpg         your painting
ravana3d/ravana-depth.png   the depth map (white = near, black = far)
ravana3d/three.module.min.js  3D library (only needed if your page doesn't already load three.js)

## Add it to the Pryme X AI website (GitHub)
1. Copy the `ravana3d` folder into your site's `assets/` folder → `assets/ravana3d/`
   (you can delete `three.module.min.js` there — the site already has three.js).
2. In the `<head>` of `index.html` and `heritage.html`, under the other scripts, add:
       <script type="module" src="assets/ravana3d/ravana3d.js"></script>
3. Replace the old Ravana boxes:
   • heritage.html — top hero:
       <div class="stage" data-scene="ravana" data-mode="hero" data-offset="0.36"></div>
     →  <div class="stage" data-ravana3d data-fade="0.06"></div>
   • heritage.html — "Legends in 3D" first card:
       <div class="stage" data-scene="ravana"></div>
     →  <div class="stage" data-ravana3d data-fit="cover" data-fade="0"></div>
   • heritage.html and index.html — the paper study panel:
       <div class="stage" data-scene="sketch"></div>
     →  <div class="stage" data-ravana3d></div>
4. Commit and push to GitHub. Done.

## Options (add to the div)
data-tilt="0.24"   how far it turns     data-depth="0.32"  how deep the 3D is
data-light="0.16"  moving light on armour (0 = off)
data-embers="off"  hide the embers      data-fit="cover"   fill the box instead of showing the whole painting
data-offset="0.2"  move it right (negative = left)      data-fade="0"  hard edges instead of soft fade
