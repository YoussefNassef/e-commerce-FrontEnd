export type SupportTicketStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
export type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type SupportTicketCategory = 'order' | 'payment' | 'return' | 'technical' | 'account' | 'other';
export type SupportMessageAuthorRole = 'user' | 'admin';

export interface SupportMessage {
  id: string;
  ticketId: string;
  authorUserId: number;
  authorRole: SupportMessageAuthorRole;
  authorName: string | null;
  message: string;
  isInternal: boolean;
  createdAt: string;
}

export interface SupportTicketSummary {
  id: string;
  userId: number;
  userName: string | null;
  unreadCount: number;
  orderId: string | null;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  category: SupportTicketCategory;
  assignedAdminUserId: number | null;
  lastMessageAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketDetails extends SupportTicketSummary {
  messages: SupportMessage[];
}

export interface SupportTicketListMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface SupportTicketListResponse {
  items: SupportTicketSummary[];
  meta: SupportTicketListMeta;
}

export interface CreateSupportTicketPayload {
  subject: string;
  message: string;
  orderId?: string | null;
  priority?: SupportTicketPriority;
  category?: SupportTicketCategory;
}

export interface CreateSupportMessagePayload {
  message: string;
  isInternal?: boolean;
}

export interface UpdateSupportTicketStatusPayload {
  status: SupportTicketStatus;
  note?: string;
}

export interface SupportTicketsFilter {
  page?: number;
  limit?: number;
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  orderId?: string;
  userId?: number;
  assignedToMe?: boolean;
}
