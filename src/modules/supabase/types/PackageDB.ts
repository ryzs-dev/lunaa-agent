export interface PackageDB {
    id?: number;
    packageName: string;
    packageCode?: string;
    description?: string;
    basePrice?: number;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }