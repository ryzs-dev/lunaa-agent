export interface CustomerInput {
  fb_name?: string;
  name: string; // Name
  phone_number: string;
  repeat_customer?: 'returning' | 'new';
  email?: string;
}
