/**
 * ThinkRight Resend Email Notification, News & Alert Service
 * Handles automated activity notifications, JAMB Insider news alerts, and Admin broadcasts
 * via the 'send-email' Supabase Edge Function.
 * (Authentication emails remain handled natively by Supabase Auth).
 */
(() => {
  'use strict';

  async function invokeEmailFunction(payload) {
    if (!window.supabase || typeof window.supabase.functions?.invoke !== 'function') {
      console.warn('[ThinkRightEmail] Supabase functions client not available');
      return { ok: false, error: 'Email service unavailable right now' };
    }

    try {
      const response = await window.supabase.functions.invoke('send-email', {
        body: payload
      });

      if (response.error) {
        return {
          ok: false,
          error: response.error.message || 'Could not dispatch email notification'
        };
      }

      if (response.data && response.data.ok === false) {
        return {
          ok: false,
          error: response.data.error || 'Resend rejected the email request'
        };
      }

      return { ok: true, data: response.data };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Network error sending email'
      };
    }
  }

  /**
   * Subscribe a student or guest to JAMB News, Exam Alerts & Study Reminders
   */
  async function subscribeAlerts({ email, name = '', categories = ['jamb_news', 'exam_alerts', 'study_reminders'] }) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { ok: false, error: 'Please enter a valid email address' };
    }

    // Persist locally so UI remembers subscription state immediately
    try {
      localStorage.setItem(
        'thinkright_email_alerts',
        JSON.stringify({
          email: cleanEmail,
          name: String(name || '').trim(),
          categories,
          subscribed_at: new Date().toISOString()
        })
      );
    } catch (_e) {}

    // Save to Supabase database RPC if available
    if (window.supabase && typeof window.supabase.rpc === 'function') {
      try {
        await window.supabase.rpc('subscribe_email_alerts', {
          p_email: cleanEmail,
          p_name: String(name || '').trim() || null,
          p_categories: categories
        });
      } catch (_err) {
        // Continue to send welcome confirmation even if migration hasn't run yet
      }
    }

    // Dispatch instant welcome alert email via Resend
    return await invokeEmailFunction({
      action: 'send',
      to: cleanEmail,
      template: 'alert_welcome',
      template_data: {
        name: String(name || '').trim() || cleanEmail.split('@')[0],
        categories
      }
    });
  }

  /**
   * Send an Admin Broadcast (JAMB News, Urgent Exam Alert, Study Reminder, Announcement)
   */
  async function sendBroadcast({
    audience = 'all',
    category = 'announcement',
    subject = '',
    title = '',
    body = '',
    action_text = '',
    action_url = '',
    custom_emails = ''
  }) {
    return await invokeEmailFunction({
      action: 'broadcast',
      audience,
      category,
      subject,
      title,
      body,
      action_text: action_text || undefined,
      action_url: action_url || undefined,
      custom_emails: custom_emails || undefined
    });
  }

  window.ThinkRightEmail = {
    send: (options) => invokeEmailFunction({ action: 'send', ...options }),
    subscribeAlerts,
    sendBroadcast,

    notifyTeacherReview: ({ recipient_user_id, to, name, status, message }) =>
      invokeEmailFunction({
        action: 'send',
        to,
        recipient_user_id,
        template: 'teacher_status',
        template_data: { name, status, message }
      }),

    notifyClassReview: ({ recipient_user_id, to, name, class_title, decision, feedback, class_id }) =>
      invokeEmailFunction({
        action: 'send',
        to,
        recipient_user_id,
        template: 'class_review',
        template_data: { name, class_title, decision, feedback, class_id }
      }),

    notifyDiscussionReply: ({ recipient_user_id, to, recipient_name, responder_name, class_title, excerpt, action_url }) =>
      invokeEmailFunction({
        action: 'send',
        to,
        recipient_user_id,
        template: 'discussion_reply',
        template_data: { recipient_name, responder_name, class_title, excerpt, action_url }
      }),

    notifyNewLesson: ({ recipient_user_id, to, student_name, class_title, lesson_title, class_id }) =>
      invokeEmailFunction({
        action: 'send',
        to,
        recipient_user_id,
        template: 'new_lesson',
        template_data: { student_name, class_title, lesson_title, class_id }
      }),

    sendStudyReminder: ({ recipient_user_id, to, name, title, body }) =>
      invokeEmailFunction({
        action: 'send',
        to,
        recipient_user_id,
        template: 'study_reminder',
        template_data: { name, title, body }
      }),

    sendEnrollmentReceipt: ({ to, recipient_user_id, student_name, class_title, amount, reference, class_id }) =>
      invokeEmailFunction({
        action: 'send',
        to,
        recipient_user_id,
        template: 'enrollment_receipt',
        template_data: { student_name, class_title, amount, reference, class_id }
      })
  };
})();
