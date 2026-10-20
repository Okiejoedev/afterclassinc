# Launch test checklist

Do this once before inviting real users, and again after any big change. You need a computer and **three phones** (borrow two). Tick each box; if something fails, write down what you saw and use **Report a problem** (or tell your developer).

Use real email addresses you can open. Allow about 45 minutes.

## 0. Setup (once)
- [ ] Supabase → SQL Editor: the latest `supabase/schema.sql` has been run and says **Success**.
- [ ] Supabase → Authentication → URL Configuration: **Site URL** is your live address (e.g. `https://okiejoedev.github.io/afterclassinc/`) and it is also listed under **Redirect URLs** with `**` at the end.
- [ ] Emails work (custom SMTP set up, or "Confirm email" turned off on purpose).
- [ ] You made yourself admin (README → "Your admin page").

## 1. Teacher account
- [ ] On the home page choose **I'm a teacher**, register, tick the terms box.
- [ ] Confirmation email arrives within 2 minutes and its link opens your live site (not "localhost").
- [ ] Sign in → you land on the teacher **Home** page with the Getting started steps.
- [ ] **School**: search for an institution (try "yabatech"), pick it, upload a logo, **Save**. Reload: details are still there.

## 2. Make a quiz
- [ ] **+ New quiz ▾ → From your notes**: upload a PDF of real lesson notes, choose 15 questions, **Generate**. Questions read well and include different kinds (multiple choice, true/false, written).
- [ ] Edit one question, delete one, **Save quiz**. Reload: changes are kept.
- [ ] **+ New quiz ▾ → Sample quiz** adds a ready-made quiz.

## 3. Live game (all three phones)
- [ ] On the quiz press **▶ Play live → Open host screen**. PIN and QR code show.
- [ ] **Share on WhatsApp** opens WhatsApp with the link and PIN.
- [ ] Phone 1 joins by typing the address and PIN; phone 2 by scanning the QR code; phone 3 from the WhatsApp link.
- [ ] Press **Start**. Every phone shows each question; answering works; the leaderboard and final podium appear on the host screen.
- [ ] Turn one phone's data off for 20 seconds mid-game, then on: it catches up.
- [ ] **Results** shows the game with everyone's scores; **Download CSV** opens in Excel.

## 4. Class, student account and test
- [ ] **Class lists → Create class** "Test Class", paste three names and numbers. A **class code** appears; **Send code on WhatsApp** works.
- [ ] On phone 1 (private/incognito window) register as a **student**, confirm the email, sign in, **Join a class** with the code.
- [ ] Teacher: on a quiz choose **More ways → Assignment / online test**, pick "Test Class", set a 10-minute timer.
- [ ] Student dashboard shows it under **To do**; **Start**, answer, hand in. The result appears under **Recent results**.
- [ ] Teacher: **Results** shows the student by name; written answers can be marked.
- [ ] After closing the test, the student can **Practise** it, and the **Leaderboard** shows their place.

## 5. Print
- [ ] On a quiz press **Print**. The heading shows your institution, logo and motto.
- [ ] **Print / Save as PDF** gives a clean A4 paper; **Download Word file** opens in Word.

## 6. Phone extras
- [ ] On an Android phone in Chrome: menu → **Install app**. The Afterclass icon appears on the home screen and opens the site.
- [ ] **Report a problem** (bottom of any page) sends; it appears on your **Admin** page, and **Mark done** works.

## 7. Safety and data
- [ ] A student account opening `/teacher/` sees "This is a student account", not the dashboard.
- [ ] **School → Download my data** saves a backup file.
- [ ] Sign out on every device when you finish.

If every box is ticked, you're ready for your first real class.
