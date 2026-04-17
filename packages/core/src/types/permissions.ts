export type Permission =
  | 'fs:read'
  | 'fs:write'
  | 'fs:delete'
  | 'npm:run'
  | 'npm:install'
  | 'git:read'
  | 'git:write'
  | 'browser:launch'
  | 'browser:screenshot'
  | 'asset:generate'
  | 'eval:run';

export interface PermissionPolicy {
  allowed: Permission[];
  denied: Permission[];
  pathRestrictions?: {
    allowedPaths: string[];
    deniedPaths: string[];
  };
}

export const READ_ONLY_POLICY: PermissionPolicy = {
  allowed: ['fs:read', 'git:read'],
  denied: ['fs:write', 'fs:delete', 'npm:run', 'npm:install', 'browser:launch', 'asset:generate'],
};

export const FULL_DEV_POLICY: PermissionPolicy = {
  allowed: [
    'fs:read',
    'fs:write',
    'fs:delete',
    'npm:run',
    'npm:install',
    'git:read',
    'git:write',
    'browser:launch',
    'browser:screenshot',
    'asset:generate',
    'eval:run',
  ],
  denied: [],
};

export const GAMEPLAY_POLICY: PermissionPolicy = {
  allowed: ['fs:read', 'fs:write', 'npm:run', 'git:read'],
  denied: ['fs:delete', 'npm:install', 'browser:launch', 'asset:generate'],
};

export const PLAYTEST_POLICY: PermissionPolicy = {
  allowed: ['fs:read', 'browser:launch', 'browser:screenshot', 'npm:run', 'eval:run'],
  denied: ['fs:write', 'fs:delete', 'npm:install', 'git:write', 'asset:generate'],
};
