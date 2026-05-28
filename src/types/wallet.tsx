import type { Keystore } from 'ox';

export type UmKeystore = Keystore.Keystore & {
  meta: {
    type: string;
    note: string;
    umVersion?: string;
  };
  handle: string | null;
  name: string;
  address: string;
};