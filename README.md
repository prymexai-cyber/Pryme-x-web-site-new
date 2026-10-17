# Pryme X AI — website

8 pages: Home, Services, Research, About, Social, News, Join Us (+ Heritage).
Pure HTML/CSS/JS. No build step. Everything (3D, fonts, three.js) is inside this folder.

## Publish on Netlify
1. Go to https://app.netlify.com/drop
2. Drag this whole folder (or the zip) onto the page. Done.
   (To update an existing site: Site → Deploys → drag the folder again.)
Contact form submissions appear in Netlify → Forms.

## Change the logo (and browser-tab icon)
Put your logo in `assets/img/` (e.g. `my-logo.png`) and in `site-config.js` set:
    logo: "assets/img/my-logo.png",
    favicon: "assets/img/my-logo.png",
Every page updates at once.

## Change photos / phone numbers
`site-config.js` → heroImage (Lotus Tower photo), founderPhoto, signature, phones, email.
Founder photo: save your photo as `assets/img/founder.jpg` — it appears automatically (a placeholder shows until then).

## Edit ANY text or image (no coding)
1. Open the page with `?edit` at the end, e.g. `https://yoursite.netlify.app/about.html?edit`
   (or press Ctrl + Shift + E).
2. Click any text and type. Click any image to swap it.
3. Press **Download page** → replace that .html file in this folder → re-deploy.
You can also open any .html file in a text editor — all text is plain HTML.

## Colours
`assets/css/style.css`, top of file: --blue (#081B2C), --ink (black), --bg (white).

## Change the founder photo later
Replace `assets/img/founder.jpg` with your new photo (same name) and re-deploy.
(Or put a different file name in `founderPhoto` in `site-config.js`.)

## Change the King Ravana 3D model later
Built-in: a pencil-sketch 3D model made in code.
To use your own model: export it as `.glb` (Blender: File → Export → glTF 2.0, format "glb"),
put it in `assets/models/` (e.g. `ravana.glb`) and in `site-config.js` set:
    ravanaModel: "assets/models/ravana.glb",
    ravanaStyle: "sketch",     // pencil-drawing look, or "original" to keep its own colours
It is centred, sized and made to turn towards the mouse automatically, everywhere Ravana appears.
Leave ravanaModel empty ("") to go back to the built-in model.
