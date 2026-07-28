export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
}

export interface ScheduledEmail {
  id: string;
  recipient_email: string;
  subject: string;
  body: string;
  scheduled_at: string;
  status: string;
  campaign_id?: string;
}

export interface SentEmail {
  id: string;
  recipient_email: string;
  subject: string;
  body: string;
  sent_at: string;
  status: string;
  error_message?: string;
  bounce_type?: 'soft' | 'hard' | 'unknown';
  campaign_id?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: 'active' | 'completed' | 'cancelled' | 'paused';
  total_emails: number;
  sent: number;
  failed: number;
  scheduled: number;
  cancelled: number;
  total_opens: number;
  total_clicks: number;
  success_rate: string;
  created_at: string;
  updated_at: string;
}
