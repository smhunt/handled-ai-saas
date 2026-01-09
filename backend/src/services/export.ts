// Export Service - Generate CSV and JSON exports for conversations
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ExportOptions {
  businessId: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  channel?: string;
  includeMessages?: boolean;
}

export interface ConversationExportRow {
  id: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  channel: string;
  status: string;
  messageCount: number;
  handedOffToHuman: boolean;
  startedAt: string;
  lastMessageAt: string;
  endedAt: string | null;
  visitorId: string;
  pageUrl: string | null;
  referrer: string | null;
  messages?: MessageExportRow[];
}

export interface MessageExportRow {
  role: string;
  content: string;
  createdAt: string;
}

/**
 * Export conversations in the specified format
 */
export async function exportConversations(
  options: ExportOptions
): Promise<ConversationExportRow[]> {
  const { businessId, startDate, endDate, status, channel, includeMessages } = options;

  // Build query filter
  const where: any = { businessId };

  if (startDate) {
    where.startedAt = { gte: startDate };
  }

  if (endDate) {
    where.startedAt = { ...where.startedAt, lte: endDate };
  }

  if (status && status !== 'ALL') {
    where.status = status;
  }

  if (channel && channel !== 'ALL') {
    where.channel = channel;
  }

  // Fetch conversations with message count
  const conversations = await prisma.conversation.findMany({
    where,
    include: {
      _count: { select: { messages: true } },
      messages: includeMessages
        ? {
            select: {
              role: true,
              content: true,
              createdAt: true
            },
            orderBy: { createdAt: 'asc' }
          }
        : false
    },
    orderBy: { startedAt: 'desc' }
  });

  // Transform to export format
  return conversations.map((conv) => ({
    id: conv.id,
    customerName: conv.customerName,
    customerEmail: conv.customerEmail,
    customerPhone: conv.customerPhone,
    channel: conv.channel,
    status: conv.status,
    messageCount: conv._count.messages,
    handedOffToHuman: conv.handedOffToHuman,
    startedAt: conv.startedAt.toISOString(),
    lastMessageAt: conv.lastMessageAt.toISOString(),
    endedAt: conv.endedAt?.toISOString() || null,
    visitorId: conv.visitorId,
    pageUrl: conv.pageUrl,
    referrer: conv.referrer,
    messages: includeMessages && conv.messages
      ? conv.messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt.toISOString()
        }))
      : undefined
  }));
}

/**
 * Generate CSV string from conversations data
 */
export function conversationsToCSV(data: ConversationExportRow[]): string {
  if (data.length === 0) {
    return 'No data to export';
  }

  // Define columns
  const columns = [
    { key: 'id', header: 'ID' },
    { key: 'customerName', header: 'Customer Name' },
    { key: 'customerEmail', header: 'Customer Email' },
    { key: 'customerPhone', header: 'Customer Phone' },
    { key: 'channel', header: 'Channel' },
    { key: 'status', header: 'Status' },
    { key: 'messageCount', header: 'Message Count' },
    { key: 'handedOffToHuman', header: 'Handed Off' },
    { key: 'startedAt', header: 'Started At' },
    { key: 'lastMessageAt', header: 'Last Message At' },
    { key: 'endedAt', header: 'Ended At' },
    { key: 'visitorId', header: 'Visitor ID' },
    { key: 'pageUrl', header: 'Page URL' },
    { key: 'referrer', header: 'Referrer' }
  ];

  // Generate header row
  const headers = columns.map((c) => c.header).join(',');

  // Generate data rows
  const rows = data.map((item) => {
    return columns
      .map((col) => {
        const value = (item as any)[col.key];
        const str = String(value ?? '');
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(',');
  });

  return [headers, ...rows].join('\n');
}

/**
 * Generate detailed CSV with messages (one row per message)
 */
export function conversationsWithMessagesToCSV(data: ConversationExportRow[]): string {
  if (data.length === 0) {
    return 'No data to export';
  }

  const columns = [
    { key: 'conversationId', header: 'Conversation ID' },
    { key: 'customerName', header: 'Customer Name' },
    { key: 'customerEmail', header: 'Customer Email' },
    { key: 'customerPhone', header: 'Customer Phone' },
    { key: 'channel', header: 'Channel' },
    { key: 'status', header: 'Status' },
    { key: 'messageRole', header: 'Message Role' },
    { key: 'messageContent', header: 'Message Content' },
    { key: 'messageCreatedAt', header: 'Message Time' }
  ];

  const headers = columns.map((c) => c.header).join(',');
  const rows: string[] = [];

  for (const conv of data) {
    if (conv.messages && conv.messages.length > 0) {
      for (const msg of conv.messages) {
        const row = [
          conv.id,
          escapeCsvValue(conv.customerName || ''),
          escapeCsvValue(conv.customerEmail || ''),
          escapeCsvValue(conv.customerPhone || ''),
          conv.channel,
          conv.status,
          msg.role,
          escapeCsvValue(msg.content),
          msg.createdAt
        ].join(',');
        rows.push(row);
      }
    } else {
      // Conversation with no messages
      const row = [
        conv.id,
        escapeCsvValue(conv.customerName || ''),
        escapeCsvValue(conv.customerEmail || ''),
        escapeCsvValue(conv.customerPhone || ''),
        conv.channel,
        conv.status,
        '',
        '',
        ''
      ].join(',');
      rows.push(row);
    }
  }

  return [headers, ...rows].join('\n');
}

function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const exportService = {
  exportConversations,
  conversationsToCSV,
  conversationsWithMessagesToCSV
};
