export type ReturnReason =
  | 'damaged'
  | 'wrong_item'
  | 'not_as_described'
  | 'changed_mind'
  | 'other';

export type ReturnStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'refund_initiated'
  | 'refunded'
  | 'cancelled';

export interface ReturnRequestDto {
  id: string;
  orderId: string;
  userId: number;
  reason: ReturnReason;
  reasonDetails: string | null;
  status: ReturnStatus;
  refundAmount: number;
  adminNote: string | null;
  handledByAdminUserId: number | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  refundInitiatedAt: string | null;
  refundedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReturnRequestPayload {
  orderId: string;
  reason: ReturnReason;
  reasonDetails?: string;
}

export interface UpdateReturnRequestStatusPayload {
  status: Exclude<ReturnStatus, 'requested'>;
  adminNote?: string;
  refundAmount?: number;
}
