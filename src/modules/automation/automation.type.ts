export type AutomationDataInput = {
  name: string;
  description?: string;
  is_active: boolean;
  trigger_event: string;
  delay_seconds: number;
  actions: AutomationActionInput[];
};

export type AutomationActionInput = {
  type: 'send_template';
  config: {
    templateName: string;
    variables?: string[];
  };
};
