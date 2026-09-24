// src/mcp/CPI_MCP/types.ts — Shared CPI entity types used across all tool handlers

export interface CpiRuntimeArtifact {
  Id:          string;
  Name:        string;
  Type:        string;
  Status:      string;
  Version:     string;
  PackageId?:  string;
  DeployedOn?: string;
  DeployedBy?: string;
  ErrorInformation?: string;
}

export interface CpiArtifact {
  Id:          string;
  Name:        string;
  Version:     string;
  PackageId:   string;
  Description?: string;
  CreatedBy?:  string;
  ModifiedBy?: string;
  ModifiedAt?: string;
}

export interface CpiMessageLog {
  MessageGuid:         string;
  Status:              string;
  IntegrationFlowName?: string;
  LogStart?:           string;
  LogEnd?:             string;
  Sender?:             string;
  Receiver?:           string;
  ErrorInformation?:   string;
  IntegrationArtifact?: { Name?: string; Id?: string };
  ErrorInfos?:         Array<{ ErrorMessage?: string }>;
}

export interface CpiCredential {
  Name: string;
  Kind: string;
}

export interface CpiOAuthCredential {
  Name:            string;
  ClientId:        string;
  TokenServiceUrl: string;
}

export interface CpiKeystoreEntry {
  Alias:          string;
  Type:           string;
  ValidNotAfter?: string;
}

export interface CpiValueMapping {
  Id:      string;
  Name:    string;
  Version: string;
  Type:    string;
}

export interface CpiPackage {
  Id:        string;
  Name:      string;
  Version:   string;
  ShortText?: string;
}

export interface CpiServiceEndpoint {
  Name:     string;
  Id:       string;
  Protocol: string;
  Url:      string;
  Type?:    string;
}

export interface CpiJmsQueue {
  Name:          string;
  Size:          number;
  MaxSize:       number;
  ConsumerCount?: number;
}

export interface CpiDataStoreEntry {
  Id:              string;
  DataStoreName:   string;
  IntegrationFlow?: string;
  Type:            string;
  Status?:         string;
}

export interface CpiVariable {
  VariableName:     string;
  IntegrationFlow?: string;
  Visibility?:      string;
  UpdatedAt?:       string;
  RetainUntil?:     string;
}

export type Environment = 'DEV' | 'TEST' | 'PROD';

export type ToolResult = { content: Array<{ type: 'text'; text: string }> };
