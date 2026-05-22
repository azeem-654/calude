export interface EmailStep {
  id: string;
  day: number;
  subject: string;
  body: string;
  followUpRule: string;
}

export interface EmailSequence {
  id: string;
  name: string;
  goal: string;
  steps: EmailStep[];
  status: 'draft' | 'active' | 'paused';
  createdAt: string;
  enrolledCount: number;
}

export type AutomationNodeType =
  | 'trigger'
  | 'wait'
  | 'condition'
  | 'send_email'
  | 'send_sms'
  | 'add_tag'
  | 'remove_tag'
  | 'create_task'
  | 'assign_to'
  | 'update_field'
  | 'end';

export interface AutomationNode {
  id: string;
  type: AutomationNodeType;
  label: string;
  config: Record<string, string>;
  nextId: string | null;
  yesId?: string | null;
  noId?: string | null;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused';
  nodes: AutomationNode[];
  createdAt: string;
  enrolledCount: number;
  completedCount: number;
}

export interface FieldMapping {
  csvHeader: string;
  crmField: string;
}

export interface ImportSummary {
  total: number;
  imported: number;
  duplicates: number;
  errors: number;
}
