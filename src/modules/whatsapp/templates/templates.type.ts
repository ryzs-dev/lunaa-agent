export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export type ParameterFormat = 'POSITIONAL' | 'NAMED';

export type TemplateComponent =
  | HeaderComponent
  | BodyComponent
  | FooterComponent
  | ButtonComponent;

export type HeaderComponent =
  | {
      type: 'HEADER';
      format: 'TEXT';
      text: string;
    }
  | {
      type: 'HEADER';
      format: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
      example?: {
        header_handle: string[];
      };
    };

export type BodyComponent = {
  type: 'BODY';
  text: string;
};

export type FooterComponent = {
  type: 'FOOTER';
  text: string;
};

export type ButtonType = 'URL' | 'PHONE_NUMBER' | 'QUICK_REPLY' | 'FLOW';

export type ButtonComponent = {
  type: 'BUTTONS';
  buttons: TemplateButton[];
};

export type TemplateButton =
  | {
      type: 'URL';
      text: string;
      url: string;
    }
  | {
      type: 'PHONE_NUMBER';
      text: string;
      phone_number: string;
    }
  | {
      type: 'QUICK_REPLY';
      text: string;
    }
  | {
      type: 'FLOW';
      text: string;
      flow_id: string;
      flow_action?: string;
      navigate_screen?: string;
    }
  | {
      type: 'COPY_CODE';
      example: string;
    };

export type TemplateRequestType = {
  name: string;
  language: string;
  category: TemplateCategory;
  parameter_format?: ParameterFormat;

  components: TemplateComponent[];
};

export type SendTemplateParams = {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: {
      code: 'en_US' | 'zh_CN';
    };
    components?: TemplateComponent[];
  };
};

export type SendTemplateInput = {
  to: string;
  templateName: string;
  language?: string; // default en_US
  variables?: string[]; // ordered {{1}}, {{2}}, etc.
};
