/** Mirrors the backend DTOs (backend/src/modules/<feature>/dto). Money is always a decimal string. */

export type Role = "PLATFORM_ADMIN" | "GARAGE_ADMIN" | "SERVICE_ADVISOR" | "MECHANIC";
export type RecordStatus = "ACTIVE" | "INACTIVE";
export type Channel = "SMS" | "EMAIL";
export type FuelType = "PETROL" | "DIESEL" | "CNG" | "LPG" | "ELECTRIC" | "HYBRID" | "OTHER";
export type FuelLevel = "EMPTY" | "QUARTER" | "HALF" | "THREE_QUARTER" | "FULL";
export type JobStatus =
  | "CHECKED_IN"
  | "DIAGNOSING"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "IN_PROGRESS"
  | "QUALITY_CHECK"
  | "READY_FOR_PICKUP"
  | "DELIVERED"
  | "CANCELLED";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ProblemCategory =
  | "ENGINE" | "TRANSMISSION" | "BRAKES" | "SUSPENSION" | "STEERING" | "ELECTRICAL"
  | "AIR_CONDITIONING" | "BODY" | "TYRES" | "COOLING" | "EXHAUST" | "OTHER";
export type EstimateStatus =
  | "DRAFT" | "SENT" | "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED" | "EXPIRED" | "SUPERSEDED";
export type LineItemType = "PART" | "LABOUR";
export type LineApproval = "PENDING" | "APPROVED" | "REJECTED";
export type InvoiceStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "VOID";
export type PaymentMethod = "CASH" | "CARD" | "UPI" | "BANK_TRANSFER" | "OTHER";
export type NotificationType =
  | "JOB_CHECKED_IN" | "PROBLEMS_FOUND" | "ESTIMATE_SENT" | "JOB_APPROVED"
  | "READY_FOR_PICKUP" | "INVOICE_ISSUED" | "SERVICE_REMINDER" | "STAFF_WELCOME";
export type NotificationStatus = "QUEUED" | "SENDING" | "SENT" | "FAILED";

export interface Envelope<T> { status: number; message: string; data: T }
export interface Paged<T> { status: number; message: string; total: number; limit: number; offset: number; data: T[] }
export interface ApiErrorBody {
  statusCode: number;
  errorCode: string;
  message: string;
  details?: { field: string; issue: string }[];
}

export interface Ref { id: string; name: string }

export interface SessionUser {
  id: string; name: string; email: string; role: Role;
  garageId: string | null; garageName: string | null; mustChangePassword: boolean;
}
export interface Session { accessToken: string; tokenType: "Bearer"; expiresIn: number; user: SessionUser }

export interface Garage {
  id: string; name: string; addressLine: string | null; city: string | null; state: string | null;
  postalCode: string | null; phone: string; email: string | null; taxRegistrationNumber: string | null;
  currency: string; taxRate: string; timezone: string; status: "ACTIVE" | "SUSPENDED";
}

export interface Staff {
  id: string; name: string; email: string; phone: string | null; role: Exclude<Role, "PLATFORM_ADMIN">;
  status: RecordStatus; mustChangePassword: boolean; lastLoginAt: string | null; createdAt: string;
}

export interface Customer {
  id: string; name: string; phone: string; email: string | null; address: string | null;
  preferredChannels: Channel[]; notes: string | null; status: RecordStatus; vehicleCount: number;
  createdAt: string;
}
export interface CustomerDetail extends Customer {
  vehicles: { id: string; registrationNumber: string; make: string; model: string; status: RecordStatus }[];
}

export interface Vehicle {
  id: string; registrationNumber: string; vin: string | null; make: string; model: string;
  variant: string | null; manufactureYear: number | null; fuelType: FuelType; color: string | null;
  odometerKm: number; nextServiceDate: string | null; status: RecordStatus;
  owner: { id: string; name: string; phone: string }; createdAt: string;
}
export interface VehicleDetail extends Vehicle {
  openJobCard: { id: string; jobNumber: string; status: JobStatus; createdAt: string } | null;
}
export interface ServiceHistoryItem {
  jobCardId: string; jobNumber: string; status: JobStatus; checkinOdometerKm: number;
  customerComplaints: string; problemTitles: string[]; invoiceNumber: string | null;
  invoiceTotal: string | null; createdAt: string; closedAt: string | null;
}

export interface JobListItem {
  id: string; jobNumber: string; status: JobStatus;
  vehicle: { id: string; registrationNumber: string; make: string; model: string };
  customer: { id: string; name: string; phone: string };
  assignedMechanic: Ref | null; promisedDeliveryAt: string | null; isOverdue: boolean;
  createdAt: string; updatedAt: string;
}
export interface JobDetail extends JobListItem {
  checkinOdometerKm: number; fuelLevel: FuelLevel | null; customerComplaints: string; openedBy: Ref;
  closedAt: string | null; deliveredOnCredit: boolean; cancellationReason: string | null;
  problemCount: number;
  latestEstimate: { id: string; version: number; status: EstimateStatus; total: string; approvedTotal: string | null } | null;
  invoice: { id: string; invoiceNumber: string; status: InvoiceStatus; total: string; amountPaid: string; balanceDue: string } | null;
  allowedTransitions: JobStatus[];
}
export interface StatusHistory {
  id: string; fromStatus: JobStatus | null; toStatus: JobStatus; changedBy: Ref | null;
  note: string | null; createdAt: string;
}

export interface Attachment {
  id: string; jobCardId: string; problemId: string | null; originalName: string; mimeType: string;
  sizeBytes: number; caption: string | null; uploadedBy: Ref; createdAt: string;
}
export interface Problem {
  id: string; jobCardId: string; title: string; description: string | null; severity: Severity;
  category: ProblemCategory; requiresNewEstimate: boolean; locked: boolean; recordedBy: Ref;
  attachments: Attachment[]; createdAt: string;
}

export interface EstimateLine {
  id: string; itemType: LineItemType; description: string; quantity: string; unitPrice: string;
  lineTotal: string; approvalState: LineApproval; problemId: string | null; sortOrder: number;
}
export interface Estimate {
  id: string; jobCardId: string; version: number; status: EstimateStatus; subtotal: string;
  taxRate: string; taxAmount: string; total: string; approvedTotal: string | null;
  validUntil: string | null; sentAt: string | null; respondedAt: string | null;
  approvalMethod: "CUSTOMER_LINK" | "VERBAL" | null; createdBy: Ref; createdAt: string;
  customerRemark?: string | null; verbalApprovalNote?: string | null; items?: EstimateLine[];
}

export interface NotificationRow {
  id: string; jobCardId: string | null; customerId: string | null; type: NotificationType;
  channel: Channel; recipient: string; subject: string | null; body: string;
  status: NotificationStatus; attempts: number; lastError: string | null; sentAt: string | null;
  createdBy: Ref | null; createdAt: string;
}

export interface Payment {
  id: string; amount: string; method: PaymentMethod; reference: string | null; receivedAt: string; receivedBy: Ref;
}
export interface InvoiceSummary {
  id: string; invoiceNumber: string; jobCardId: string; jobNumber: string; customer: Ref;
  vehicleRegistration: string; status: InvoiceStatus; total: string; amountPaid: string;
  balanceDue: string; currency: string; issuedAt: string;
}
export interface Invoice extends InvoiceSummary {
  subtotal: string; discount: string; taxRate: string; taxAmount: string; notes: string | null;
  items: { id: string; itemType: LineItemType; description: string; quantity: string; unitPrice: string; lineTotal: string }[];
  payments: Payment[]; createdBy: Ref;
}

export interface DashboardSummary {
  jobsByStatus: { status: JobStatus; count: number }[];
  openJobs: number; dueToday: number; overdue: number; awaitingApproval: number; readyForPickup: number;
  topProblemCategories: { category: ProblemCategory; count: number }[];
  revenue?: { today: string; thisMonth: string; currency: string };
}

export interface PortalView {
  linkPurpose: "VIEW_JOB" | "APPROVE_ESTIMATE";
  garage: { name: string; phone: string; address: string | null };
  customerFirstName: string;
  vehicle: { registrationNumber: string; make: string; model: string };
  jobNumber: string; status: JobStatus; checkedInAt: string; promisedDeliveryAt: string | null;
  problems: {
    id: string; title: string; description: string | null; severity: Severity; category: ProblemCategory;
    photos: { id: string; caption: string | null; mimeType: string; path: string }[];
  }[];
  estimate: PortalEstimate | null;
  timeline: { status: JobStatus; at: string }[];
  invoice: { invoiceNumber: string; total: string; amountPaid: string; balanceDue: string } | null;
}
export interface PortalEstimate {
  id: string; version: number; status: EstimateStatus; currency: string;
  items: Omit<EstimateLine, "sortOrder">[]; subtotal: string; taxRate: string; taxAmount: string;
  total: string; approvedTotal: string | null; validUntil: string | null; respondedAt: string | null;
  canRespond: boolean;
}
