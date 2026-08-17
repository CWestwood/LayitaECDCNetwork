// src/features/ecdcs/types.ts

export interface EcdcPractitioner {
  id: string;
  name: string | null;
  contact_number1: string | null;
  contact_number2: string | null;
  group: { id: string; group_name: string } | null;
  training: Record<string, boolean> | null;
}

export interface EcdcWithPractitioners {
  id: string;
  name: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  chief: string | null;
  headman: string | null;
  practitioners: EcdcPractitioner[];
}
