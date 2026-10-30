# ThinkRight — Resend Setup for Notifications, Email News & Alerts

ThinkRight uses **Supabase Auth** natively for authentication emails (sign-up verification & password resets) and **Resend** exclusively for:
1. **JAMB News & Urgent Exam Alerts Broadcasts** (dispatched from the Admin Control Room in `admin.html`)
2. **Automated Activity Notifications** (teacher profile reviews, class curriculum approvals, student discussion replies, new class lessons, and study reminders)
3. **JAMB Insider Alert Subscriptions** (student opt-in box on `insider.html`)

---

## 1. Create Your Resend API Key

1. Log in at [Resend](https://resend.com) &rarr; **API Keys** &rarr; **Create API Key**.
2. Name it `ThinkRight Notifications & Alerts` with **Sending access**.
3. Copy your key (starts with `re_...`).
4. Under **Domains**, verify your domain (e.g. `thinkright.name.ng`) so you can send from `ThinkRight Alerts <notifications@thinkright.name.ng>`.
   *(For testing before domain verification, set `RESEND_DEFAULT_FROM="ThinkRight <onboarding@resend.dev>"`)*.

---

## 2. Run the Subscribers & Broadcast Log SQL Migration

Open the **Supabase SQL Editor** and run the migration in [`supabase/email_notifications.sql`](file:///c:/Users/basir/OneDrive/Desktop/ThinkRight-main/supabase/email_notifications.sql):
- Creates `public.email_subscribers` (stores alert subscribers and their chosen categories: `jamb_news`, `exam_alerts`, `study_reminders`, `class_updates`).
- Creates `public.email_broadcast_logs` (audit history of admin broadcasts).
- Creates RPC `public.subscribe_email_alerts(...)`.

---

## 3. Configure Secrets & Deploy the Edge Function

Run in your terminal via Supabase CLI:

```bash
# 1. Set your Resend API Key
supabase secrets set RESEND_API_KEY="re_your_api_key_here"

# 2. Set your sender address
supabase secrets set RESEND_DEFAULT_FROM="ThinkRight Alerts <notifications@thinkright.name.ng>"

# 3. Set your site URL
supabase secrets set SITE_URL="https://thinkright.name.ng"

# 4. Deploy the send-email Edge Function
supabase functions deploy send-email
```

*(Or add `RESEND_API_KEY`, `RESEND_DEFAULT_FROM`, and `SITE_URL` in **Supabase Dashboard** &rarr; **Edge Functions** &rarr; **Secrets**).*

---

## 4. Where Resend Is Wired in ThinkRight

1. **Admin Broadcast Center (`admin.html` &rarr; "News & alerts" tab)**:
   - Choose category (`JAMB Insider News & Policy`, `Urgent Exam / Deadline Alert`, `Study & CBT Mock Reminder`, or `Platform Announcement`).
   - Choose audience (`All Subscribers, Students & Educators`, `Subscribed Alert Recipients Only`, `UTME Students Only`, `Educators Only`, or `Specific Email Address(es)`).
   - Dispatches batch emails via Resend's `/emails/batch` API.

2. **JAMB Insider Alert Subscription Box (`insider.html`)**:
   - Students can select topics (`JAMB News & Cut-Offs`, `Urgent Exam Deadlines`, `Weekly Study Reminders`) and subscribe with 1 click.
   - Saves to `public.email_subscribers` and dispatches an instant welcome confirmation via Resend.

3. **Automated Activity Notifications (`js/teacher-workspace.js` & `js/email-service.js`)**:
   - **Teacher Review**: Automatically emails the educator when an admin approves or updates their profile status.
   - **Class Curriculum Review**: Automatically emails the educator when their class is published or needs revision changes.
   - **Discussion Reply**: Automatically emails the student when an educator replies to their question in class discussions.
