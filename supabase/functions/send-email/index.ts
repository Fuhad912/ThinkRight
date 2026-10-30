import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type EmailTemplateName =
  | "alert_welcome"
  | "jamb_news"
  | "exam_alert"
  | "study_reminder"
  | "new_lesson"
  | "discussion_reply"
  | "teacher_status"
  | "class_review"
  | "enrollment_receipt"
  | "subscription_receipt"
  | "custom";

interface SendEmailPayload {
  action?: "send" | "broadcast";
  to?: string | string[];
  recipient_user_id?: string;
  subject?: string;
  from?: string;
  reply_to?: string;
  html?: string;
  text?: string;
  template?: EmailTemplateName;
  template_data?: Record<string, unknown>;
  // Broadcast fields
  audience?: "all" | "subscribers" | "students" | "teachers" | "custom";
  category?: "jamb_news" | "exam_alert" | "study_reminder" | "announcement";
  custom_emails?: string | string[];
  title?: string;
  body?: string;
  action_text?: string;
  action_url?: string;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * ThinkRight Design System Email Wrapper
 * Uses exact tokens from css/premium-ui.css & css/teacher-workspace.css:
 * - Fonts: Space Grotesk (headings/brand) & Manrope (body/UI)
 * - Colors: #f7f8fa (--surface-subtle), #ffffff (--surface-bg), #101828 (--text-primary),
 *           #475467 (--text-secondary), #667085 (--text-muted), #d0d5dd (--line-subtle),
 *           #1d4ed8 (--accent-primary), #157f3b (--success), #b54708 (--warning), #b42318 (--danger)
 * - Icons: Font Awesome 6.5.1 CDN
 */
function baseTemplate(
  title: string,
  contentHtml: string,
  options?: {
    eyebrow?: string;
    icon?: string;
    badgeText?: string;
    tone?: "primary" | "success" | "warning" | "danger";
    actionButton?: { text: string; url: string; icon?: string };
    siteUrl?: string;
  }
): string {
  const tone = options?.tone || "primary";
  const siteUrl = options?.siteUrl || "https://thinkright.com.ng";
  const eyebrow = options?.eyebrow || "THINKRIGHT DISPATCH";
  const faIcon = options?.icon || "fa-bell";
  const badgeText = options?.badgeText || "UTME Studio";

  const toneMap = {
    primary: {
      accent: "#1d4ed8",
      softBg: "#eef4ff",
      border: "#bfdbfe",
    },
    success: {
      accent: "#157f3b",
      softBg: "#ecfdf3",
      border: "#abefc6",
    },
    warning: {
      accent: "#b54708",
      softBg: "#fffaeb",
      border: "#fedf89",
    },
    danger: {
      accent: "#b42318",
      softBg: "#fef3f2",
      border: "#fecdca",
    },
  }[tone];

  const buttonHtml = options?.actionButton
    ? `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 26px 0 8px;">
      <tr>
        <td align="left">
          <a href="${esc(options.actionButton.url)}" target="_blank" style="display: inline-block; background-color: #1d4ed8; color: #ffffff; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 12px 22px; border-radius: 11px; font-weight: 700; font-size: 13px; text-decoration: none; letter-spacing: -0.01em; box-shadow: 0 2px 8px rgba(29, 78, 216, 0.22);">
            <span>${esc(options.actionButton.text)}</span>
            <i class="fa-solid ${esc(options.actionButton.icon || "fa-arrow-right")}" style="margin-left: 8px; font-size: 11px;"></i>
          </a>
        </td>
      </tr>
    </table>
  `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
</head>
<body style="margin: 0; padding: 0; background-color: #f7f8fa; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #101828; font-size: 14px; line-height: 1.6; -webkit-font-smoothing: antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f7f8fa; padding: 36px 14px;">
    <tr>
      <td align="center">
        <!-- Main Surface Card (--surface-bg, --line-subtle, --radius-xl, --shadow-md) -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 20px; border: 1px solid #d0d5dd; overflow: hidden; box-shadow: 0 10px 28px rgba(16, 24, 40, 0.08);">
          
          <!-- Top Accent Ribbon -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, #1d4ed8 0%, #3b82f6 100%); font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Navbar-Matched Brand Header (.tr-navbar style) -->
          <tr>
            <td style="padding: 22px 32px; background-color: #ffffff; border-bottom: 1px solid #eff2f6;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="left" valign="middle">
                    <a href="${esc(siteUrl)}" target="_blank" style="text-decoration: none; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 23px; font-weight: 700; letter-spacing: -0.04em; color: #101828;">
                      ThinkRight<span style="color: #1d4ed8;">.</span>
                    </a>
                  </td>
                  <td align="right" valign="middle">
                    <span style="display: inline-block; font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${toneMap.accent}; background-color: ${toneMap.softBg}; border: 1px solid ${toneMap.border}; padding: 4px 11px; border-radius: 999px;">
                      <i class="fa-solid ${esc(faIcon)}" style="margin-right: 5px; font-size: 10px;"></i>${esc(badgeText)}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Area -->
          <tr>
            <td style="padding: 32px 32px 28px;">
              <!-- Eyebrow (.tw-eyebrow) -->
              <div style="font-family: 'Manrope', sans-serif; font-size: 10px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: ${toneMap.accent}; margin-bottom: 8px;">
                <i class="fa-solid ${esc(faIcon)}" style="margin-right: 6px;"></i>${esc(eyebrow)}
              </div>

              <!-- Heading (Space Grotesk) -->
              <h1 style="margin: 0 0 16px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 24px; font-weight: 700; color: #101828; letter-spacing: -0.035em; line-height: 1.22;">
                ${esc(title)}
              </h1>

              <!-- Body Copy (Manrope, --text-secondary #475467) -->
              <div style="font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; color: #475467; line-height: 1.65;">
                ${contentHtml}
              </div>

              ${buttonHtml}

              <!-- Support Bar -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #eff2f6;">
                <tr>
                  <td style="font-family: 'Manrope', sans-serif; font-size: 12px; color: #667085;">
                    <i class="fa-solid fa-life-ring" style="color: #1d4ed8; margin-right: 6px;"></i>
                    Need assistance? Reach our academic team at 
                    <a href="mailto:thinkright912@gmail.com" style="color: #1d4ed8; font-weight: 700; text-decoration: none;">thinkright912@gmail.com</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Subtle Footer (--surface-subtle #f7f8fa) -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f7f8fa; border-top: 1px solid #d0d5dd; font-family: 'Manrope', sans-serif; font-size: 11.5px; color: #667085; text-align: center; line-height: 1.55;">
              <p style="margin: 0 0 6px; font-weight: 600; color: #475467;">
                <i class="fa-solid fa-graduation-cap" style="color: #1d4ed8; margin-right: 5px;"></i>
                ThinkRight &middot; Digital UTME Preparation &amp; Learning Studio
              </p>
              <p style="margin: 0;">
                &copy; ${new Date().getFullYear()} ThinkRight Nigeria. Sent to your registered alert address.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function generateTemplateHtml(
  template: string,
  data: Record<string, unknown>,
  siteUrl: string
): { subject: string; html: string; text: string } {
  switch (template) {
    case "alert_welcome": {
      const name = String(data.name || "Scholar");
      const categories = Array.isArray(data.categories)
        ? (data.categories as string[])
        : ["jamb_news", "exam_alerts", "study_reminders"];
      const subject = "Subscribed: ThinkRight JAMB Insider News & Exam Alerts";
      const actionUrl = `${siteUrl}/insider.html`;

      const html = baseTemplate(
        `Welcome to JAMB Insider Alerts, ${name}`,
        `
          <p style="margin: 0 0 14px;">Your email is now connected to <strong>ThinkRight JAMB Insider</strong>. You will receive verified notifications as soon as important updates drop:</p>
          
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f7f8fa; border: 1px solid #d0d5dd; border-radius: 14px; padding: 16px 18px; margin: 18px 0;">
            <tr>
              <td style="padding-bottom: 10px;">
                <i class="fa-solid fa-calendar-check" style="color: #1d4ed8; width: 18px;"></i>
                <strong style="color: #101828; font-size: 13px;">Official JAMB Dates &amp; Deadlines</strong>
                <div style="font-size: 12px; color: #475467; padding-left: 22px;">Registration closing dates, mock slip printing, and exam schedules.</div>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom: 10px;">
                <i class="fa-solid fa-building-columns" style="color: #1d4ed8; width: 18px;"></i>
                <strong style="color: #101828; font-size: 13px;">Cut-Off Marks &amp; Admission Policy</strong>
                <div style="font-size: 12px; color: #475467; padding-left: 22px;">Federal, State, and Private university departmental admission updates.</div>
              </td>
            </tr>
            <tr>
              <td>
                <i class="fa-solid fa-fire" style="color: #1d4ed8; width: 18px;"></i>
                <strong style="color: #101828; font-size: 13px;">Study &amp; CBT Mock Reminders</strong>
                <div style="font-size: 12px; color: #475467; padding-left: 22px;">High-yield practice drills and live educator class notifications.</div>
              </td>
            </tr>
          </table>

          <p style="margin: 0; font-size: 12px; color: #667085;">
            <i class="fa-solid fa-sliders" style="color: #1d4ed8; margin-right: 5px;"></i>
            Active topics: <strong style="color: #475467;">${esc(categories.join(", ").replaceAll("_", " "))}</strong>
          </p>
        `,
        {
          eyebrow: "JAMB INSIDER SUBSCRIPTION",
          icon: "fa-bell",
          badgeText: "Alerts Active",
          tone: "primary",
          actionButton: { text: "Open JAMB Insider", url: actionUrl, icon: "fa-arrow-right" },
          siteUrl,
        }
      );

      const text = `Welcome to JAMB Insider Alerts, ${name}!\n\nYou are now subscribed to receive official JAMB dates, cut-off marks, and CBT study reminders.\n\nExplore JAMB Insider: ${actionUrl}`;
      return { subject, html, text };
    }

    case "jamb_news": {
      const title = String(data.title || "JAMB UTME News & Admission Update");
      const bodyText = String(data.body || data.message || "");
      const subject = String(data.subject || `JAMB Insider: ${title}`);
      const actionUrl = String(data.action_url || `${siteUrl}/insider.html`);
      const actionText = String(data.action_text || "Read Full Update on Insider");

      const paragraphs = bodyText
        .split(/\n+/)
        .filter(Boolean)
        .map((p) => `<p style="margin: 0 0 14px;">${esc(p)}</p>`)
        .join("");

      const html = baseTemplate(title, paragraphs, {
        eyebrow: "JAMB INSIDER NEWS",
        icon: "fa-newspaper",
        badgeText: "Admissions News",
        tone: "primary",
        actionButton: { text: actionText, url: actionUrl, icon: "fa-arrow-right" },
        siteUrl,
      });

      const text = `${title}\n\n${bodyText}\n\nRead more: ${actionUrl}`;
      return { subject, html, text };
    }

    case "exam_alert": {
      const title = String(data.title || "Urgent JAMB UTME Alert");
      const bodyText = String(data.body || data.message || "");
      const subject = String(data.subject || `Urgent UTME Alert: ${title}`);
      const actionUrl = String(data.action_url || `${siteUrl}/practice.html`);
      const actionText = String(data.action_text || "Open ThinkRight Now");

      const paragraphs = bodyText
        .split(/\n+/)
        .filter(Boolean)
        .map((p) => `<p style="margin: 0 0 14px;">${esc(p)}</p>`)
        .join("");

      const html = baseTemplate(
        title,
        `
          <div style="background-color: #fef3f2; border: 1px solid #fecdca; border-left: 4px solid #b42318; padding: 13px 16px; border-radius: 10px; margin-bottom: 18px; font-size: 13px; color: #b42318; font-weight: 700;">
            <i class="fa-solid fa-triangle-exclamation" style="margin-right: 6px;"></i>
            Priority Notice for UTME Candidates &amp; Educators
          </div>
          ${paragraphs}
        `,
        {
          eyebrow: "PRIORITY EXAM ALERT",
          icon: "fa-bolt",
          badgeText: "Urgent Alert",
          tone: "danger",
          actionButton: { text: actionText, url: actionUrl, icon: "fa-arrow-right" },
          siteUrl,
        }
      );

      const text = `URGENT EXAM ALERT: ${title}\n\n${bodyText}\n\nTake action: ${actionUrl}`;
      return { subject, html, text };
    }

    case "study_reminder": {
      const name = String(data.name || "Scholar");
      const title = String(data.title || `Keep your UTME momentum going, ${name}`);
      const bodyText = String(
        data.body ||
          data.message ||
          "Consistent daily CBT practice is the strongest differentiator for candidates scoring 300+ in JAMB. Take a 10-minute topic drill or a full mock exam today to sharpen your speed and accuracy."
      );
      const subject = String(data.subject || "Daily UTME Practice Reminder — Keep Your Streak Active");
      const actionUrl = String(data.action_url || `${siteUrl}/practice.html`);
      const actionText = String(data.action_text || "Start CBT Practice Drill");

      const paragraphs = bodyText
        .split(/\n+/)
        .filter(Boolean)
        .map((p) => `<p style="margin: 0 0 14px;">${esc(p)}</p>`)
        .join("");

      const html = baseTemplate(title, paragraphs, {
        eyebrow: "DAILY PRACTICE STREAK",
        icon: "fa-fire",
        badgeText: "Study Reminder",
        tone: "warning",
        actionButton: { text: actionText, url: actionUrl, icon: "fa-play" },
        siteUrl,
      });

      const text = `${title}\n\n${bodyText}\n\nPractice now: ${actionUrl}`;
      return { subject, html, text };
    }

    case "new_lesson": {
      const studentName = String(data.student_name || data.name || "Scholar");
      const classTitle = String(data.class_title || "Your Enrolled Class");
      const lessonTitle = String(data.lesson_title || "New Video Lesson");
      const classId = String(data.class_id || "");
      const subject = `New Lesson Published in ${classTitle}: ${lessonTitle}`;
      const actionUrl = classId ? `${siteUrl}/cohort.html?id=${encodeURIComponent(classId)}` : `${siteUrl}/my-classes.html`;

      const html = baseTemplate(
        `New Lesson Available: ${lessonTitle}`,
        `
          <p style="margin: 0 0 14px;">Hi <strong style="color: #101828;">${esc(studentName)}</strong>,</p>
          <p style="margin: 0 0 16px;">A new video lesson has just been published in your class <strong style="color: #101828;">${esc(classTitle)}</strong>.</p>
          
          <div style="background-color: #f7f8fa; border: 1px solid #d0d5dd; border-radius: 14px; padding: 16px 18px; margin: 18px 0;">
            <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #1d4ed8; font-weight: 800; margin-bottom: 4px;">
              <i class="fa-solid fa-circle-play" style="margin-right: 5px;"></i>NEW LESSON RELEASED
            </div>
            <div style="font-family: 'Space Grotesk', sans-serif; font-size: 16px; font-weight: 700; color: #101828;">${esc(lessonTitle)}</div>
            <div style="font-size: 12.5px; color: #475467; margin-top: 2px;">${esc(classTitle)}</div>
          </div>

          <p style="margin: 0;">Watch the lesson at your own pace and post any questions in the class discussion stream.</p>
        `,
        {
          eyebrow: "CLASSROOM UPDATE",
          icon: "fa-book-open",
          badgeText: "New Lesson",
          tone: "success",
          actionButton: { text: "Watch Lesson Now", url: actionUrl, icon: "fa-play" },
          siteUrl,
        }
      );

      const text = `Hi ${studentName},\n\nA new lesson "${lessonTitle}" is now live in ${classTitle}.\nWatch here: ${actionUrl}`;
      return { subject, html, text };
    }

    case "discussion_reply": {
      const recipientName = String(data.recipient_name || "Scholar");
      const responderName = String(data.responder_name || "Instructor");
      const classTitle = String(data.class_title || "Class Discussion");
      const replyExcerpt = String(data.excerpt || "");
      const subject = `${responderName} replied to your question in ${classTitle}`;
      const actionUrl = String(data.action_url || `${siteUrl}/tutor-discussions.html`);

      const html = baseTemplate(
        "New Reply in Class Discussions",
        `
          <p style="margin: 0 0 14px;">Hi <strong style="color: #101828;">${esc(recipientName)}</strong>,</p>
          <p style="margin: 0 0 16px;"><strong style="color: #101828;">${esc(responderName)}</strong> posted a response in <strong style="color: #101828;">${esc(classTitle)}</strong>:</p>
          
          <div style="background-color: #f7f8fa; border: 1px solid #d0d5dd; border-left: 4px solid #1d4ed8; border-radius: 12px; padding: 16px 18px; margin: 18px 0; color: #101828; font-size: 13.5px;">
            <i class="fa-solid fa-quote-left" style="color: #1d4ed8; opacity: 0.5; margin-right: 6px;"></i>
            ${esc(replyExcerpt)}
          </div>
        `,
        {
          eyebrow: "CLASS DISCUSSION",
          icon: "fa-comments",
          badgeText: "New Reply",
          tone: "primary",
          actionButton: { text: "View Conversation", url: actionUrl, icon: "fa-arrow-right" },
          siteUrl,
        }
      );

      const text = `Hi ${recipientName},\n\n${responderName} replied in ${classTitle}:\n\n"${replyExcerpt}"\n\nView at: ${actionUrl}`;
      return { subject, html, text };
    }

    case "teacher_status": {
      const name = String(data.name || "Educator");
      const status = String(data.status || "active");
      const message = String(data.message || "");
      const isApproved = status === "active";
      const subject = isApproved
        ? "Approved: Your ThinkRight Educator Studio Account is Active"
        : "Update on Your ThinkRight Educator Profile";
      const actionUrl = `${siteUrl}/tutor-dashboard.html`;

      const html = baseTemplate(
        isApproved ? "Educator Account Approved" : "Educator Profile Review Update",
        `
          <p style="margin: 0 0 14px;">Hi <strong style="color: #101828;">${esc(name)}</strong>,</p>
          ${
            isApproved
              ? `<p style="margin: 0 0 14px;">Your ThinkRight educator profile has been verified and approved. You can now submit and publish structured classes to UTME candidates across Nigeria.</p>`
              : `<p style="margin: 0 0 14px;">Our academic review team has updated the status of your educator profile (<strong style="color: #101828;">${esc(status)}</strong>).</p>`
          }
          ${
            message
              ? `<div style="background-color: #eef4ff; border: 1px solid #bfdbfe; border-left: 4px solid #1d4ed8; padding: 14px 16px; border-radius: 10px; margin: 18px 0; font-size: 13px; color: #1e40af;">
                  <strong style="display: block; margin-bottom: 4px;"><i class="fa-solid fa-clipboard-check" style="margin-right: 6px;"></i>Reviewer Feedback</strong>
                  ${esc(message)}
                </div>`
              : ""
          }
        `,
        {
          eyebrow: "TEACHER WORKSPACE",
          icon: isApproved ? "fa-circle-check" : "fa-id-badge",
          badgeText: isApproved ? "Verified Educator" : "Profile Review",
          tone: isApproved ? "success" : "warning",
          actionButton: { text: "Open Teacher Studio", url: actionUrl, icon: "fa-arrow-right" },
          siteUrl,
        }
      );

      const text = `Hi ${name},\n\n${isApproved ? "Your educator account is approved!" : "Status update: " + status}\n${message}\n\nOpen Studio: ${actionUrl}`;
      return { subject, html, text };
    }

    case "class_review": {
      const name = String(data.name || "Educator");
      const classTitle = String(data.class_title || "Your Class");
      const decision = String(data.decision || "approve");
      const feedback = String(data.feedback || "");
      const classId = String(data.class_id || "");
      const isApproved = decision === "approve";
      const subject = isApproved
        ? `Class Approved & Published: ${classTitle}`
        : `Revision Requested: ${classTitle}`;
      const actionUrl = classId ? `${siteUrl}/tutor-class.html?id=${encodeURIComponent(classId)}` : `${siteUrl}/tutor-classes.html`;

      const html = baseTemplate(
        isApproved ? `Class Published: ${classTitle}` : `Changes Requested: ${classTitle}`,
        `
          <p style="margin: 0 0 14px;">Hi <strong style="color: #101828;">${esc(name)}</strong>,</p>
          ${
            isApproved
              ? `<p style="margin: 0 0 14px;">Your curriculum revision for <strong style="color: #101828;">${esc(classTitle)}</strong> has been approved and is now live in the student class catalog.</p>`
              : `<p style="margin: 0 0 14px;">The ThinkRight academic review team reviewed <strong style="color: #101828;">${esc(classTitle)}</strong> and requested modifications before publishing.</p>`
          }
          ${
            feedback
              ? `<div style="background-color: #fffaeb; border: 1px solid #fedf89; border-left: 4px solid #b54708; padding: 14px 16px; border-radius: 10px; margin: 18px 0; font-size: 13px; color: #b54708;">
                  <strong style="display: block; margin-bottom: 4px;"><i class="fa-solid fa-pen-to-square" style="margin-right: 6px;"></i>Reviewer Notes</strong>
                  ${esc(feedback)}
                </div>`
              : ""
          }
        `,
        {
          eyebrow: "CURRICULUM REVIEW",
          icon: isApproved ? "fa-circle-check" : "fa-pen-to-square",
          badgeText: isApproved ? "Published" : "Changes Requested",
          tone: isApproved ? "success" : "warning",
          actionButton: { text: "Open Class Studio", url: actionUrl, icon: "fa-arrow-right" },
          siteUrl,
        }
      );

      const text = `Hi ${name},\n\n${isApproved ? "Your class is now published!" : "Changes were requested for your class."}\nClass: ${classTitle}\n${feedback ? "Feedback: " + feedback : ""}\n\nStudio link: ${actionUrl}`;
      return { subject, html, text };
    }

    case "enrollment_receipt": {
      const studentName = String(data.student_name || data.name || "Student");
      const classTitle = String(data.class_title || "UTME Prep Class");
      const amount = String(data.amount || "₦0");
      const reference = String(data.reference || "TR-REF");
      const classId = String(data.class_id || "");
      const subject = `Enrollment Confirmed: ${classTitle}`;
      const actionUrl = classId ? `${siteUrl}/cohort.html?id=${encodeURIComponent(classId)}` : `${siteUrl}/my-classes.html`;

      const html = baseTemplate(
        "Class Enrollment Confirmed",
        `
          <p style="margin: 0 0 14px;">Hi <strong style="color: #101828;">${esc(studentName)}</strong>,</p>
          <p style="margin: 0 0 16px;">Your enrollment in <strong style="color: #101828;">${esc(classTitle)}</strong> is active. You now have full access to all recorded video lessons and educator discussions.</p>
          
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f7f8fa; border: 1px solid #d0d5dd; border-radius: 14px; padding: 16px 18px; margin: 18px 0; font-size: 13px;">
            <tr>
              <td style="color: #667085; padding-bottom: 8px;">Class Cohort</td>
              <td align="right" style="font-weight: 700; color: #101828; padding-bottom: 8px;">${esc(classTitle)}</td>
            </tr>
            <tr>
              <td style="color: #667085; padding-bottom: 8px;">Amount Paid</td>
              <td align="right" style="font-weight: 700; color: #157f3b; padding-bottom: 8px;">${esc(amount)}</td>
            </tr>
            <tr>
              <td style="color: #667085;">Transaction Ref</td>
              <td align="right" style="font-family: monospace; font-size: 12px; color: #475467;">${esc(reference)}</td>
            </tr>
          </table>
        `,
        {
          eyebrow: "ENROLLMENT RECEIPT",
          icon: "fa-circle-check",
          badgeText: "Confirmed",
          tone: "success",
          actionButton: { text: "Start Learning Now", url: actionUrl, icon: "fa-play" },
          siteUrl,
        }
      );

      const text = `Hi ${studentName},\n\nYour enrollment in "${classTitle}" is confirmed!\nAmount: ${amount}\nReference: ${reference}\nAccess class: ${actionUrl}`;
      return { subject, html, text };
    }

    default: {
      const title = String(data.title || "ThinkRight Update & Alert");
      const bodyText = String(data.body || data.message || "");
      const actionUrl = data.action_url ? String(data.action_url) : undefined;
      const actionText = data.action_text ? String(data.action_text) : "Open ThinkRight";
      const subject = String(data.subject || title);

      const paragraphs = bodyText
        .split(/\n+/)
        .filter(Boolean)
        .map((p) => `<p style="margin: 0 0 14px;">${esc(p)}</p>`)
        .join("");

      const html = baseTemplate(title, paragraphs, {
        eyebrow: String(data.badge || "ANNOUNCEMENT"),
        icon: "fa-bullhorn",
        badgeText: String(data.badge || "Announcement"),
        tone: "primary",
        actionButton: actionUrl ? { text: actionText, url: actionUrl, icon: "fa-arrow-right" } : undefined,
        siteUrl,
      });

      const text = `${title}\n\n${bodyText}\n\n${actionUrl ? "Link: " + actionUrl : ""}`;
      return { subject, html, text };
    }
  }
}

async function resolveUserEmailById(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
): Promise<string | null> {
  if (!supabaseUrl || !serviceRoleKey || !userId) return null;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.email || data?.user?.email || null;
  } catch (_e) {
    return null;
  }
}

async function resolveBroadcastRecipients(
  supabaseUrl: string,
  serviceRoleKey: string,
  audience: string,
  customEmails?: string | string[]
): Promise<string[]> {
  const emailSet = new Set<string>();
  const addEmail = (raw: unknown) => {
    const clean = String(raw || "").trim().toLowerCase();
    if (clean && clean.includes("@")) emailSet.add(clean);
  };

  if (customEmails) {
    const list = Array.isArray(customEmails)
      ? customEmails
      : String(customEmails).split(/[,;\s]+/);
    list.forEach(addEmail);
  }

  if (audience === "custom" || !supabaseUrl || !serviceRoleKey) {
    return Array.from(emailSet);
  }

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  try {
    let queryUrl = `${supabaseUrl}/rest/v1/email_subscribers?select=email,role&subscribed=eq.true`;
    if (audience === "students") queryUrl += `&role=eq.student`;
    if (audience === "teachers") queryUrl += `&role=eq.teacher`;
    const subRes = await fetch(queryUrl, { headers, signal: AbortSignal.timeout(10000) });
    if (subRes.ok) {
      const subs = await subRes.json();
      if (Array.isArray(subs)) subs.forEach((row) => addEmail(row.email));
    }
  } catch (_e) {}

  if (audience === "all" || audience === "students" || audience === "teachers") {
    try {
      const usersRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, {
        headers,
        signal: AbortSignal.timeout(12000),
      });
      if (usersRes.ok) {
        const usersPayload = await usersRes.json();
        const users = Array.isArray(usersPayload?.users) ? usersPayload.users : [];
        for (const u of users) {
          const role = String(u.user_metadata?.role || "student").toLowerCase();
          if (audience === "all") addEmail(u.email);
          else if (audience === "teachers" && role === "teacher") addEmail(u.email);
          else if (audience === "students" && role !== "teacher") addEmail(u.email);
        }
      }
    } catch (_e) {}
  }

  return Array.from(emailSet);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "RESEND_API_KEY is not configured in Supabase Edge Function secrets",
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const defaultFrom = Deno.env.get("RESEND_DEFAULT_FROM") || "ThinkRight Alerts <notifications@thinkright.com.ng>";
  const siteUrl = (Deno.env.get("SITE_URL") || "https://thinkright.com.ng").replace(/\/$/, "");

  try {
    const payload: SendEmailPayload = await req.json();
    const fromAddress = payload.from || defaultFrom;

    // MODE 1: ADMIN BROADCAST
    if (payload.action === "broadcast") {
      const audience = payload.audience || "all";
      const category = payload.category || "jamb_news";
      const title = String(payload.title || payload.subject || "ThinkRight Alert").trim();
      const body = String(payload.body || "").trim();

      if (!title || !body) {
        return new Response(
          JSON.stringify({ ok: false, error: "Broadcast title and message body are required" }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const recipients = await resolveBroadcastRecipients(
        supabaseUrl,
        serviceRoleKey,
        audience,
        payload.custom_emails
      );

      if (!recipients.length) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "No recipient email addresses found for the selected audience",
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const templateName: EmailTemplateName =
        category === "exam_alert"
          ? "exam_alert"
          : category === "study_reminder"
          ? "study_reminder"
          : category === "jamb_news"
          ? "jamb_news"
          : "custom";

      const generated = generateTemplateHtml(
        templateName,
        {
          subject: payload.subject || title,
          title,
          body,
          action_text: payload.action_text,
          action_url: payload.action_url,
          badge: category.replaceAll("_", " ").toUpperCase(),
        },
        siteUrl
      );

      const batchIds: string[] = [];
      for (let i = 0; i < recipients.length; i += 100) {
        const chunk = recipients.slice(i, i + 100);
        const batchPayload = chunk.map((email) => ({
          from: fromAddress,
          to: [email],
          subject: generated.subject,
          html: generated.html,
          text: generated.text,
          reply_to: payload.reply_to || undefined,
        }));

        const batchRes = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(batchPayload),
          signal: AbortSignal.timeout(20000),
        });

        const batchResult = await batchRes.json();
        if (!batchRes.ok) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: batchResult.message || "Resend batch API failed",
              details: batchResult,
            }),
            { status: batchRes.status, headers: CORS_HEADERS }
          );
        }

        if (Array.isArray(batchResult?.data)) {
          batchResult.data.forEach((item: { id?: string }) => {
            if (item?.id) batchIds.push(item.id);
          });
        }
      }

      if (supabaseUrl && serviceRoleKey) {
        try {
          await fetch(`${supabaseUrl}/rest/v1/email_broadcast_logs`, {
            method: "POST",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              audience,
              category,
              subject: generated.subject,
              title,
              body,
              action_text: payload.action_text || null,
              action_url: payload.action_url || null,
              recipient_count: recipients.length,
            }),
          });
        } catch (_e) {}
      }

      return new Response(
        JSON.stringify({
          ok: true,
          recipient_count: recipients.length,
          batch_ids: batchIds,
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // MODE 2: SINGLE / ACTIVITY NOTIFICATION EMAIL
    let targetEmail = payload.to;
    if (!targetEmail && payload.recipient_user_id) {
      const resolved = await resolveUserEmailById(
        supabaseUrl,
        serviceRoleKey,
        payload.recipient_user_id
      );
      if (resolved) targetEmail = resolved;
    }

    if (!targetEmail) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing recipient email or valid recipient_user_id" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    let subject = payload.subject;
    let html = payload.html;
    let text = payload.text;

    if (payload.template) {
      const generated = generateTemplateHtml(payload.template, payload.template_data || {}, siteUrl);
      if (!subject) subject = generated.subject;
      if (!html) html = generated.html;
      if (!text) text = generated.text;
    }

    if (!subject || (!html && !text)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Email subject and content/template are required" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const recipients = Array.isArray(targetEmail) ? targetEmail : [targetEmail];

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: recipients,
        subject,
        html: html || undefined,
        text: text || undefined,
        reply_to: payload.reply_to || undefined,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const resendResult = await resendResponse.json();
    if (!resendResponse.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: resendResult.message || "Failed to send email via Resend",
          details: resendResult,
        }),
        { status: resendResponse.status, headers: CORS_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        id: resendResult.id,
        recipients,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error sending email";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
});
