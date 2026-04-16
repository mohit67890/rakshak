@description('Base name used to derive resource names')
param resourceBaseName string
param location string = resourceGroup().location

@description('Cosmos DB database name')
param databaseName string = 'raksha-db'

@description('User-assigned managed identity principal ID granted data-plane access')
param identityPrincipalId string

var accountName = toLower('${resourceBaseName}-cosmos')

// Container definitions — must match scripts/setup-cosmos.mjs
var containers = [
  {
    name: 'complaints'
    partitionKey: '/tenantId'
  }
  {
    name: 'conversations'
    partitionKey: '/visitorId'
  }
  {
    name: 'messages'
    partitionKey: '/conversationId'
  }
  {
    name: 'auditLogs'
    partitionKey: '/tenantId'
  }
  {
    name: 'iccConfig'
    partitionKey: '/tenantId'
  }
  {
    name: 'comments'
    partitionKey: '/complaintId'
  }
]

resource account 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: accountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    disableLocalAuth: false
    publicNetworkAccess: 'Enabled'
    minimalTlsVersion: 'Tls12'
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: account
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
  }
}

resource containerResources 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = [for c in containers: {
  parent: database
  name: c.name
  properties: {
    resource: {
      id: c.name
      partitionKey: {
        paths: [c.partitionKey]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [ { path: '/*' } ]
        excludedPaths: [ { path: '/"_etag"/?' } ]
      }
    }
  }
}]

// Grant the managed identity "Cosmos DB Built-in Data Contributor" via role assignment
// Built-in role definition ID: 00000000-0000-0000-0000-000000000002
resource dataContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: account
  name: guid(account.id, identityPrincipalId, 'data-contributor')
  properties: {
    roleDefinitionId: '${account.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: identityPrincipalId
    scope: account.id
  }
}

output accountName string = account.name
output endpoint string = account.properties.documentEndpoint
output databaseName string = database.name
#disable-next-line outputs-should-not-contain-secrets
output primaryKey string = account.listKeys().primaryMasterKey
