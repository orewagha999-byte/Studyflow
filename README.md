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
- **Settings**: your name, timer lengths, daily goal, pay rate and the wallpaper.

## Your wallpaper

The wallpaper is black by default. Open the picture button at the top right, or **Settings**, to change it:

- Pick a preset: Black, Midnight, Moonlit window, Aurora or Ember.
- Upload your own photo. It is shrunk on your device and stays there.
- Adjust **Dim** and **Blur** so the text stays easy to read.
- Pick an accent colour.
- Turn the moonlit window picture on the dashboard on or off.

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

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Page shell |
| `styles.css` | Look and feel, mobile layout and the PDF print styles |
| `app.js` | All the features |
