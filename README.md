# StudyFlow

A simple web app that helps you finish your homework and manage your work time, and turns it all into PDFs.

It runs entirely in the browser. There is no account, no server and nothing to install.

## What it does

- **Today**: a focus timer (25 minutes by default, with short and long breaks). Pick a homework task and the time you focus is added to it. A study tip on the page reacts to your homework.
- **Homework**: add tasks with a subject, due date and the minutes you think they need. Tasks are grouped into late, due today, coming up and no due date.
- **Work hours**: clock in and out of a job, or add hours you forgot. See each week as a chart and a table, with optional pay at an hourly rate.
- **Notes**: write and keep notes, saved as you type.
- **Study tips**: 23 tips on focus, remembering, planning and habits.
- **PDF**: save your homework plan, a weekly timesheet (with signature and date lines) or any note as a PDF.

## Run it

Open `index.html` in a browser. That is all.

Or serve the folder if you prefer:

```
python3 -m http.server 8000
```

then visit http://localhost:8000.

## Publish it for free

On GitHub, go to **Settings > Pages**, choose the `main` branch and the root folder, and save. Your app will be live at `https://<your-username>.github.io/<repo-name>/`.

## Saving PDFs

Press **Save as PDF** on the Homework, Work hours or Notes page. In the print window that opens, choose **Save as PDF** as the destination. On a phone, use the share or print option and save to Files.

## Your data

Everything is saved in your browser (localStorage), on that device only. Use **Settings > Download backup** to keep a copy or move to another device, and **Restore from backup** to bring it back. Clearing your browser data deletes it.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Page shell and navigation |
| `styles.css` | Look and feel, mobile layout and the PDF print styles |
| `app.js` | All the features |
