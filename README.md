# Afterclass

Turn lesson notes into quizzes, tests and printed exam papers. Run them as a **live game** (phones join with a PIN), **class teams** (no phones needed), a **self-paced assignment** or **timed online test**, or a **webinar poll / Q&A**. Works for primary schools, secondary schools, universities and training events. Teachers manage everything from a dashboard. Students can register for their own dashboard (classes, tests to do, past results) or just join a game with its PIN, no account needed.

```
Your domain (GitHub Pages)                    Supabase (free)
├── /            home: register, sign in, PIN, student dashboard ──► database: quizzes, games, players, answers
├── /teacher/    teacher dashboard   ───────► teacher and student logins
└── /teacher/host.html  projector    ───────► live updates (realtime)
                                               └── optional AI function ──► Anthropic API
```

The website is plain HTML/JS with no build step. GitHub Pages hosts the files and Supabase runs the database. Once it's set up, it runs by itself.

---

## What it does

**Making questions**
- Upload one or many PDFs / Word files / text notes (a whole term for an exam), or paste notes.
- Writers: built-in (free, simple fill-in-the-blank) or AI (exam quality, reading levels from Primary 1 to university, English / French / Hausa / Igbo / Yoruba / Pidgin, reads scanned PDFs). Each AI question says which page it came from.
- **Import past questions** you already have ("1. … A. … B. …", answer keys, Section B theory).
- Pictures and diagrams in questions; maths and chemistry notation (`$x^2$`, `$\frac{1}{2}$`, `$\ce{H2SO4}$`) with a symbol toolbar; marks per question; compulsory questions; sub-parts (a), (b).
- Question types: multiple choice, true/false, written/theory, and for live sessions polls and word clouds.

**Using them**
| Mode | For |
|---|---|
| **Live game** (PIN + QR, 3-2-1 countdown, music, timer, reveal, leaderboard, podium) | Classes with phones, webinars on Zoom / Meet |
| **Class teams** (question on the board, teacher taps the teams that got it right) | Classrooms without phones, primary schools |
| **Assignment / timed online test** (class list, one attempt each, per-student shuffle, timer that hands in automatically, "left the page" counter, answers shown after the deadline) | Homework, CA tests, CBT |
| **Printed exam** (school or university heading, cover page, Section A/B, Type A–D papers, OMR sheet, marking scheme, PDF or **Word** download) | Terminal and semester exams |

**Results**: per student and per question, absentees from the class list, written answers marked provisionally until the teacher confirms them (Full / Half / Zero, or accept all), CSV for Excel, certificates of participation, and Q&A questions from the audience.

**Schools**: one school account shares the logo and heading; Heads of Department review and approve exam papers before printing (unapproved papers print as DRAFT).

**Safety and privacy**: rude nicknames are blocked, games can be locked, written answers appear on the projector without names, scores can be hidden (default for primary), old results are deleted automatically, and there is a privacy notice for students.

---

## Setup: start to finish (about 30 minutes)

You need: a **GitHub** account, a **Supabase** account (both free), and your **Namecheap** domain for the last step.

### Step 1: Create the database (Supabase)

1. Go to **https://supabase.com** → *Start your project* → sign in with GitHub.
2. Click **New project**.
   - Name: `afterclass`
   - Database password: click *Generate*, then save it somewhere safe (you rarely need it).
   - Region: pick the one closest to you and your students.
3. Wait about 2 minutes for it to finish setting up.

### Step 2: Create the tables

1. In your Supabase project, open **SQL Editor** (left sidebar) → **New query**.
2. Open the file `supabase/schema.sql` from this folder, copy **all** of it, and paste it into the editor.
3. Click **Run**. You should see *Success. No rows returned*.

   This also creates the storage folder for question pictures, so there's nothing else to set up.
   (If you ever update Afterclass, run the new `schema.sql` again. It's safe to re-run and keeps your data.)

### Step 3: Connect the website to the database

1. In Supabase go to **Project Settings → API** (or **Data API**). Copy the **Project URL**.
2. Go to **Project Settings → API Keys**. Copy the **Publishable key** (starts with `sb_publishable_`). On older projects, copy the **anon public** key instead.
3. Open `assets/js/config.js` in any text editor (Notepad works) and paste them in:

   ```js
   export const SUPABASE_URL = "https://abcdefghijk.supabase.co";
   export const SUPABASE_ANON_KEY = "sb_publishable_xxxxxxxxxxxxxxxx";
   export const AI_ENABLED = false;
   ```

   These two values are **meant to be public**, so it's fine that they end up on GitHub. Your data is protected by the database rules in `schema.sql`. **Never** put your Anthropic API key or database password in this file.

### Step 4: Put the site on GitHub

**Option A: no software, using the GitHub website (easiest)**

1. Go to **https://github.com/new**.
   - Repository name: `afterclass`
   - Visibility: **Public** (free GitHub Pages needs a public repo; nothing secret is in these files)
   - Click **Create repository**.
2. On the new repo page, click **uploading an existing file**.
3. Open the `afterclass` folder on your computer, select **everything inside it** (including the `assets`, `teacher` and `supabase` folders) and drag it into the browser.
   - Hidden files such as `.nojekyll` may not upload this way. That's fine.
4. Click **Commit changes**.

**Option B: with Git (if you have it installed)**

```bash
cd path/to/afterclass
git init
git add .
git commit -m "Afterclass first version"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/afterclass.git
git push -u origin main
```

### Step 5: Turn on GitHub Pages

1. In your repo, go to **Settings → Pages**.
2. Under **Build and deployment**: Source = **Deploy from a branch**, Branch = **main**, folder = **/ (root)** → **Save**.
3. Wait 1–2 minutes and refresh. GitHub shows your address, e.g.
   `https://YOUR-USERNAME.github.io/afterclass/`

Open it. You should see the dark **Join a quiz** page.

### Step 6: Create your teacher account

1. In Supabase go to **Authentication → URL Configuration**:
   - **Site URL**: `https://YOUR-USERNAME.github.io/afterclass/teacher/`
   - **Redirect URLs** → Add: `https://YOUR-USERNAME.github.io/afterclass/**`
   - Save.
2. Visit `https://YOUR-USERNAME.github.io/afterclass/teacher/` → **Create an account**.
3. Check your email for the confirmation link, click it, then sign in.
   - To skip email confirmation: Supabase → **Authentication → Sign In / Providers → Email** → turn off **Confirm email**.
4. **Recommended:** once you (and any colleagues) have accounts, stop strangers from signing up. Go to Supabase → **Authentication → Sign In / Providers** → turn off **Allow new users to sign up**.

**You're live.** Create a quiz, click **Host live game**, and put the host screen on the projector.

### Step 7 (optional): Turn on the AI question writer

The built-in writer is free and works offline, but it makes simpler fill-in-the-blank questions. The AI writer produces much better questions and can read **scanned PDFs**. It runs as a Supabase Edge Function, so your API key stays secret.

1. Get an API key at **https://console.anthropic.com** → *API Keys*. Add a little credit under *Billing*.
   Cost: roughly **US$0.05–0.15 per quiz** for a typical lecture. You're billed only when a teacher presses *Generate* with the AI writer.
2. In Supabase go to **Edge Functions → Secrets** (or *Project Settings → Edge Functions*) and add:
   - `ANTHROPIC_API_KEY` = your key
   - *(optional)* `ALLOWED_EMAILS` = `you@school.edu,colleague@school.edu` (only these teachers can spend your credit)
3. Go to **Edge Functions → Deploy a new function → Via Editor**.
   - Name it exactly `generate-quiz`
   - Delete the sample code, paste in everything from `supabase/functions/generate-quiz/index.ts`, and click **Deploy**.

   *Or with the Supabase CLI:*
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR-PROJECT-REF
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   npx supabase functions deploy generate-quiz
   ```
4. In `assets/js/config.js` set `AI_ENABLED = true`, then upload that file to GitHub again (repo → `assets/js/config.js` → pencil icon → paste → *Commit changes*).

The function uses Claude Opus 5.5 and has automatic refusal fallback turned on. If the model declines some material, the request is retried on a fallback model instead of failing.

### Step 8: Connect your Namecheap domain

**On GitHub:**

1. Repo → **Settings → Pages → Custom domain**. Type `www.yourdomain.com` and click **Save**. (GitHub adds a `CNAME` file to your repo; leave it there.)
2. *(Recommended, prevents domain takeover)*: your GitHub profile picture → **Settings → Pages → Add a domain**. GitHub gives you a TXT record to add in Namecheap.

**On Namecheap:** go to **Domain List → Manage** (next to your domain) → **Advanced DNS**.

1. Delete the default parking records (the `CNAME www → parkingpage.namecheap.com` and the `URL Redirect @` record).
2. Add these records:

   | Type | Host | Value | TTL |
   |---|---|---|---|
   | A Record | `@` | `185.199.108.153` | Automatic |
   | A Record | `@` | `185.199.109.153` | Automatic |
   | A Record | `@` | `185.199.110.153` | Automatic |
   | A Record | `@` | `185.199.111.153` | Automatic |
   | CNAME Record | `www` | `YOUR-USERNAME.github.io.` | Automatic |
   | TXT Record | *(from GitHub step 2)* | *(from GitHub step 2)* | Automatic |

3. Save. DNS usually updates within 30 minutes, but it can take up to 24 hours.
4. Back in GitHub **Settings → Pages**, once the check turns green, tick **Enforce HTTPS**.
5. Update Supabase **Authentication → URL Configuration**:
   - Site URL: `https://www.yourdomain.com/teacher/`
   - Redirect URLs: add `https://www.yourdomain.com/**` and `https://yourdomain.com/**`

Now:

- **Students go to:** `https://www.yourdomain.com` (or scan the QR code on the host screen)
- **Teachers go to:** `https://www.yourdomain.com/teacher/`

---

## Running a class

**Set up once**
- **School** tab: school name, address, motto, logo, and the type of institution (primary / secondary / university / training). The type sets sensible defaults.
- **Class lists** tab: create a class and paste admission or matric numbers with names straight from Excel. Use a class list for anything graded.
- Working with colleagues? One teacher creates a **school account** on the School tab and shares the join code. The admin makes Heads of Department "HOD" with their department, and can require HOD approval before exams are printed.

**Live game** (Quizzes → Start → Live game)
1. Choose the time per question, and a class list if you want real names. For webinars choose "Webinar" and tick Q&A / ask for email.
2. Put the host screen on the projector or share it on Zoom/Meet (**F** = full screen, **A+/A−** = text size, **R** = read aloud, **Lock entry** stops late joiners).
3. Press **Space** to start. Each question reveals automatically when time runs out or everyone has answered.
4. After the end screen, open the full report (certificates are there for webinars).

**Class teams, no phones** (Quizzes → Start → Class teams): type team names, show the board, and after each reveal tap the teams that got it right.

**Assignment / timed online test** (Quizzes → Start → Assignment)
1. Pick the class list, deadline, time limit, when answers are shown (after the deadline is recommended), and per-student shuffling.
2. Click **Copy message** and paste it into your class WhatsApp/Telegram group or LMS.
3. Under **Results**: check written answers (they are provisional until you confirm), see who hasn't started, close or reopen, download CSV.

**Printed exam paper** (Quizzes → Start → Print exam paper)
1. Choose school or university style, fill in the heading (term/semester, session, class or course code, time).
2. Set Section B ("answer any THREE"), marks, Type A–D papers, cover page, OMR sheet, marking scheme, answer lines.
3. **Print / Save as PDF** (choose A4 and turn off "Headers and footers"), or **Download Word file** to edit it in Word.

**Importing past questions**: Quizzes → Import past questions, then paste or choose a Word/PDF file. Anything that still needs a correct answer is highlighted.

---

## Updating the site later

Edit a file and upload it to GitHub again (or `git commit` + `git push`). GitHub Pages republishes in about a minute. If `supabase/schema.sql` changed, run it again in the SQL Editor.

## Keeping it awake, and the free plan limits

- **Free Supabase projects pause after 7 days without use** (for example in the holidays). The included GitHub job `.github/workflows/keep-awake.yml` pings the database every 3 days so this doesn't happen. It needs no setup: just make sure the `.github` folder is uploaded (with the website upload, you may need Option B / Git, because hidden folders are sometimes skipped). If the site ever says it can't connect, open Supabase and click **Restore project**.
- **Live connections:** the free plan allows about 200 people connected at once. For bigger webinars, upgrade Supabase to Pro (500+) for that month; the site also falls back to checking every few seconds, so a few more still work.
- **Storage:** 500 MB database and 1 GB of pictures, which is enough for a whole school for years.
- **GitHub Pages:** free for public repos, with more than enough bandwidth for a school.

## Troubleshooting

| Problem | Fix |
|---|---|
| "This site isn't set up yet" | `assets/js/config.js` still has placeholder values, or the new file wasn't uploaded. |
| Teacher sign-up email link opens the wrong site | Update Site URL / Redirect URLs in Supabase (Step 6 / Step 8). |
| Students see "No open game with that PIN" | The game ended, or they mistyped the PIN. PINs are 6 digits. |
| A student sees "Please open this link in Chrome" | They are using Opera Mini (data-saving mode) or a very old browser. Chrome, Firefox, Samsung Internet or normal Opera work. |
| A student can't join a class-list test | Their number must match the class list (spaces don't matter), and the name they type must be one of the names on the list. |
| Host screen updates slowly | Realtime is blocked on the school network; the site falls back to checking every few seconds, so it still works. |
| "The AI writer is not reachable" | The function isn't deployed, is named differently than `generate-quiz`, or `ANTHROPIC_API_KEY` is missing (Step 7). |
| A scanned PDF gives no text | Use the AI writer (Step 7), or paste the text in manually. |
| Pictures don't upload | Run the latest `schema.sql` again (it creates the picture storage). |
| PowerPoint slides | Export them as PDF first (File → Export → PDF). |

## Trying it on your computer first

The `local-demo` folder (next to this one, not uploaded to GitHub) runs the whole site on your own computer with a local copy of the database. Double-click **Start Afterclass demo.bat**. It uses the same database rules as Supabase, but the AI writer is off.

## Running the MVP

**Before launch:** work through [TESTING.md](TESTING.md) with three phones.

**Your admin page.** In Supabase → SQL Editor, run this once with your own email:

```sql
insert into public.app_admins select id from auth.users where email = 'you@example.com';
```

Sign out and in again: an **Admin** tab appears in the dashboard with sign-ups, usage for the last 14 days and the messages people send with **Report a problem**.

**Emails (sign-up confirmation, password reset).** Supabase's built-in email sender is only for testing: it sends very few emails an hour and may only deliver to your own team. Before real users arrive, either
- connect a free email service: Supabase → Authentication → Emails → SMTP Settings, using e.g. [Resend](https://resend.com) or [Brevo](https://www.brevo.com) (both have free plans), or
- turn off **Confirm email** (Authentication → Sign In / Providers → Email) so people can sign in straight away.

Also set **Authentication → URL Configuration → Site URL** to your live address, and add it under **Redirect URLs** with `**` at the end, so confirmation links don't point to "localhost".

**Backups.** The free Supabase plan has no automatic backups. Once a week: Supabase → Database → Backups (paid plans), or SQL Editor → run a `select` on the main tables and download as CSV. Teachers can also save their own copy with **School → Download my data**.

**Install as an app.** The site is a Progressive Web App: on Android, Chrome's menu → **Install app**; on iPhone, Safari → Share → **Add to Home Screen**.

## Institution directory

`assets/data/institutions.json` lists 790 Nigerian universities, polytechnics and colleges of education, used by **School → Start from your institution** to fill in the exam-paper heading. It was built in October 2026 from the official registers: the [NUC](https://www.nuc.edu.ng) university lists (federal, state, private), the [NBTE register](https://www.digitalnbte.nbte.gov.ng/Public/Institutions?type=polytechnic) of polytechnics and the [NCCE](https://ncce.gov.ng/AccreditedColleges) list of NCE-awarding colleges. Mottos, towns and states were added from Wikipedia only where the article clearly matched the institution. Logos are not included: each institution's crest belongs to it, so lecturers upload their own on the School page.

## Files

```
index.html                 student join + play (phones)
teacher/index.html         teacher dashboard
teacher/host.html          live game host screen (projector)
assets/css/app.css         all styles
assets/js/config.js        your Supabase settings  ← edit this
assets/js/student.js       student logic
assets/js/teacher.js       dashboard logic
assets/js/host.js          host screen logic
assets/js/editor.js        quiz editor (pictures, maths, marks, import)
assets/js/exam.js          printable exam papers (+ docx.js for Word)
assets/js/school.js        school details, school accounts, data protection
assets/js/classes.js       class lists
assets/js/report.js        results, marking, certificates, HOD reviews
assets/js/import.js        reads past questions
assets/js/sound.js         game sounds
privacy.html               privacy notice for students
.github/workflows/keep-awake.yml   stops the free database pausing
assets/js/generate.js      built-in question writer + AI call
assets/js/extract.js       reads PDF / DOCX / text in the browser
supabase/schema.sql        database tables, security rules, scoring
supabase/functions/generate-quiz/index.ts   optional AI function
```
