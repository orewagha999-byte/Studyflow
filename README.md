# STUDORA

Plan. Focus. Achieve.

A web app that helps you finish your homework, manage your work time, and turn it all into PDFs. It has a dark dashboard on a black wallpaper that you can change to your own.

It runs entirely in the browser. There is no account, no server and nothing to install.

## What it does

- **Dashboard**: today's plan, a Pomodoro timer, upcoming work, quick tools, a study stats chart and a study tip that reacts to your tasks.
- **Tasks**: add homework with a subject, due date and the minutes you think it needs. Tasks are grouped into late, due today, coming up and no due date.
- **Study plan**: a week board. Add a task straight onto a day and move between weeks.
- **Work hours**: clock in and out of a job, or add hours you forgot. See each week as a chart and a table, with optional pay at an hourly rate.
- **Notes**: write and keep notes, saved as you type.
- **PDF tools**: save your homework list, a weekly timesheet (with signature and date lines), your study plan or any note as a PDF.
- **Pomodoro**: 25 minute focus (changeable), short and long breaks. Pick a task and the time you focus is added to it.
- **Analytics**: study time per day and per subject, your streak and your daily goal.
- **Study tips**: 23 tips on focus, remembering, planning and habits.
- **Settings**: your name, timer lengths, daily goal, pay rate, the wallpaper and an Animations switch.

## Your wallpaper

The wallpaper is black by default. Open the picture button at the top right, or **Settings**, to change it:

- Pick a preset: Black, Midnight, Moonlit window, Aurora or Ember.
- Upload your own photo. It is shrunk on your device and stays there.
- Adjust **Dim** and **Blur** so the text stays easy to read.
- Pick an accent colour.
- Turn the moonlit window picture on the dashboard on or off.

## Animations

Pages fade in one after another, numbers count up, bars and the chart draw themselves, ticked tasks pop, the timer ring glows while it runs and the stars twinkle. They play when you change page, never when you tick a task or type. Turn them off in **Settings > Animations**. They are also off automatically if your device has "reduce motion" switched on.

## Run it

Open `index.html` in a browser. That is all.

Or serve the folder if you prefer:

```
python3 -m http.server 8000
```

then visit http://localhost:8000.

## Publish it for free

On GitHub, go to **Settings > Pages**, set **Source** to **Deploy from a branch**, choose the `main` branch and the `/ (root)` folder, and save. After a minute or two your app is live at `https://<your-username>.github.io/<repo-name>/`.

## Saving PDFs

Press **Save as PDF** on the PDF tools page (or on Work hours or Notes). In the print window that opens, choose **Save as PDF** as the destination. On a phone, use the share or print option and save to Files.

## Your data

Everything is saved in your browser (localStorage), on that device only. Use **Settings > Download backup** to keep a copy or move to another device, and **Restore from backup** to bring it back. Your wallpaper photo is not part of the backup. Clearing your browser data deletes everything.

Tasks and hours saved by the earlier StudyFlow version carry over automatically.

## Turn it into an app

The whole app is three files, so it wraps easily. Two ways to do it:

1. **Install it from the browser.** Once it is live on GitHub Pages, open it in Chrome on Android, tap the menu and choose **Add to Home screen**. To make it a proper installable app (own icon, no address bar), add a `manifest.webmanifest` file and icons, and link it from `index.html`.
2. **Wrap it as an Android app.** Put `index.html`, `styles.css` and `app.js` in a wrapper such as Capacitor (or any "web to app" builder). You need Node and Android Studio on your computer for that.

Things to know before you do:

- **Saving a PDF is the one feature that needs extra work.** It uses the browser's print window (`window.print()`). A plain Android web view does not open that window by default, so inside an app the PDF buttons will do nothing until you add a native print or share step, or build the PDF with a library instead. The PDF page layouts are in `app.js` (`docHomework`, `docHours`, `docStudy`, `docNote`) and `styles.css` (the `.doc` styles at the end).
- **Fonts.** The Plus Jakarta Sans font loads from Google Fonts, so offline the app falls back to a system font. For a fully offline app, download the font files and add them with `@font-face` in `styles.css`.
- **Data.** Everything is in localStorage inside the app. Clearing the app's storage deletes it, so keep using **Download backup**.
- **Timer.** It works from the clock time it ends at, so it stays correct if the app is paused in the background, but it cannot ring or notify while the app is closed without a native notification plugin.
- **File links.** `index.html` loads `styles.css?v=3` and `app.js?v=3`. Change the number when you change those files so browsers drop old copies.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Page shell |
| `styles.css` | Look and feel, mobile layout and the PDF print styles |
| `app.js` | All the features |
