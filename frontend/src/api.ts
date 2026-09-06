import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { startProgress, stopProgress } from './utils/progressBar';

interface AxiosRequestConfigWithMetadata extends InternalAxiosRequestConfig {
  metadata?: { startTime: Date };
}

const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && !envUrl.includes('localhost')) {
    return envUrl.replace(/\/$/, '');
  }
  return '';
};

const api = axios.create({
  baseURL: getApiUrl(),
  withCredentials: true,
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' }
});

// Guard: only redirect once even if multiple concurrent requests all get 401
let isRedirectingToHome = false;

api.interceptors.request.use(
  (config: AxiosRequestConfigWithMetadata) => {
    config.metadata = { startTime: new Date() };
    startProgress();
    return config;
  },
  (error) => { stopProgress(); return Promise.reject(error); }
);

api.interceptors.response.use(
  (response) => {
    stopProgress();
    const config = response.config as AxiosRequestConfigWithMetadata;
    const duration = new Date().getTime() - (config.metadata?.startTime?.getTime() || 0);
    if (duration > 3000) console.warn(`Slow API call: ${response.config.url} took ${duration}ms`);
    return response;
  },
  (err: AxiosError) => {
    stopProgress();
    if (err.response?.status === 401 && window.location.pathname !== '/' && window.location.pathname !== '/login' && !isRedirectingToHome) {
      isRedirectingToHome = true;
      window.location.href = '/login';
    }
    console.error('API Error:', { url: err.config?.url, status: err.response?.status, message: err.message });
    return Promise.reject(err);
  }
);

export const getUser             = () => api.get('/auth/user', { timeout: 5_000 });
export const emailLogin          = (email: string, name?: string) => api.post('/auth/email-login', { email, name });
export const logout              = () => api.post('/auth/logout');

export const getSubscription     = () => api.get('/api/payment/subscription');
export const getPermissions      = () => api.get('/api/emails/permissions');

// Webhooks (Professional+)
export const getWebhookConfig    = ()                     => api.get('/auth/webhook');
export const saveWebhookConfig   = (webhookUrl: string)   => api.post('/auth/webhook', { webhookUrl });
export const regenerateWebhookSecret = ()                 => api.post('/auth/webhook/regenerate-secret');
export const getSlackStatus      = ()                     => api.get('/api/slack/status');
export const disconnectSlack     = ()                     => api.post('/api/slack/disconnect');
export const getSlackConnectUrl  = ()                     => `${getApiUrl()}/api/slack/connect`;

export const scheduleEmails      = (formData: FormData) =>
  api.post('/api/emails/schedule', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

export const getScheduledEmails  = (page = 1, limit = 50) =>
  api.get('/api/emails/scheduled', { params: { page, limit } });

export const getSentEmails       = (page = 1, limit = 50, search = '') =>
  api.get('/api/emails/sent', { params: { page, limit, ...(search ? { search } : {}) } });

export const bulkCancelEmails    = (emailIds: string[])   => api.post('/api/emails/bulk-cancel', { emailIds });
export const getTemplates        = ()                     => api.get('/api/emails/templates');
export const saveTemplate        = (data: { name: string; subject: string; body: string }) =>
  api.post('/api/emails/templates', data);
export const deleteTemplate      = (id: string)           => api.delete(`/api/emails/templates/${id}`);

// Campaigns
export const getCampaigns        = ()                     => api.get('/api/campaigns');
export const cancelCampaign      = (id: string)           => api.post(`/api/campaigns/${id}/cancel`);

// Spam score pre-check
export const checkSpamScore      = (subject: string, body: string) =>
  api.post('/api/emails/spam-check', { subject, body });

// Sequences
export const getSequences        = ()                     => api.get('/api/sequences');
export const createSequence      = (data: any)            => api.post('/api/sequences', data);
export const getSequence         = (id: string)           => api.get(`/api/sequences/${id}`);
export const deleteSequence      = (id: string)           => api.delete(`/api/sequences/${id}`);
export const enrollInSequence    = (id: string, data: any)=> api.post(`/api/sequences/${id}/enroll`, data);

// Contacts
export const getContacts         = (params?: any)         => api.get('/api/contacts', { params });
export const importContacts      = (formData: FormData, onProgress?: (pct: number) => void) =>
  api.post('/api/contacts/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
export const getTags             = ()                     => api.get('/api/contacts/tags');
export const createTag           = (data: any)            => api.post('/api/contacts/tags', data);
export const deleteTag           = (id: string)           => api.delete(`/api/contacts/tags/${id}`);
export const tagContacts         = (data: any)            => api.post('/api/contacts/tag', data);
export const deleteContact       = (id: string)           => api.delete(`/api/contacts/${id}`);
export const getSequenceEnrollments = (id: string, page = 1, limit = 50) =>
  api.get(`/api/sequences/${id}/enrollments`, { params: { page, limit } });
export const exportContacts      = (tagId?: string) => {
  const API_URL = import.meta.env.VITE_API_URL || '';
  return `${API_URL}/api/contacts/export${tagId ? `?tag=${tagId}` : ''}`;
};

// CSV export — download directly via anchor tag
export const getExportUrl        = (status: string, from?: string, to?: string) => {
  const API_URL = import.meta.env.VITE_API_URL || '';
  const params  = new URLSearchParams({ status });
  if (from) params.set('from', from);
  if (to)   params.set('to', to);
  return `${API_URL}/api/emails/export?${params}`;
};

export default api;
