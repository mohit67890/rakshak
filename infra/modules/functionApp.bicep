@description('Base name used to derive resource names')
param resourceBaseName string
param location string = resourceGroup().location

@description('User-assigned managed identity resource ID')
param identityResourceId string

@description('User-assigned managed identity client ID')
param identityClientId string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Storage account name used for Functions runtime + Durable Functions state')
param storageAccountName string

@description('Storage connection string (same account; reused for Functions runtime + blob access)')
@secure()
param storageConnectionString string

@description('Cosmos DB endpoint')
param cosmosEndpoint string

@description('Cosmos DB primary key')
@secure()
param cosmosKey string

@description('Cosmos DB database name')
param cosmosDatabase string

@description('Microsoft Graph app client ID (for email notifications). Optional.')
param graphClientId string = ''

@description('Microsoft Graph app client secret. Optional.')
@secure()
param graphClientSecret string = ''

@description('Microsoft Graph tenant ID. Optional.')
param graphTenantId string = ''

@description('Sender email address used when dispatching Graph email notifications. Optional.')
param graphSenderEmail string = ''

@description('Durable Functions task hub name.')
param durableTaskHubName string = 'RakshaTaskHub'

var planName = '${resourceBaseName}-api-plan'
var functionAppName = '${resourceBaseName}-api'

// Consumption plan (Linux) for Azure Functions
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  kind: 'linux'
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityResourceId}': {}
    }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20'
      ftpsState: 'FtpsOnly'
      minTlsVersion: '1.2'
      cors: {
        allowedOrigins: [
          'https://teams.microsoft.com'
          'https://*.teams.microsoft.com'
          'https://*.microsoft.com'
          'https://*.skype.com'
        ]
        supportCredentials: false
      }
      appSettings: [
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }

        // Functions runtime storage (required)
        { name: 'AzureWebJobsStorage', value: storageConnectionString }
        { name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING', value: storageConnectionString }
        { name: 'WEBSITE_CONTENTSHARE', value: toLower(functionAppName) }

        // Run-from-package
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }

        // Application Insights
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }

        // Managed identity hint (for Azure SDK DefaultAzureCredential if used)
        { name: 'AZURE_CLIENT_ID', value: identityClientId }

        // Durable Functions
        { name: 'DURABLE_TASK_HUB_NAME', value: durableTaskHubName }

        // Cosmos DB
        { name: 'COSMOS_ENDPOINT', value: cosmosEndpoint }
        { name: 'COSMOS_KEY', value: cosmosKey }
        { name: 'COSMOS_DATABASE', value: cosmosDatabase }

        // Azure Blob Storage (evidence + complaint PDFs)
        { name: 'STORAGE_CONNECTION_STRING', value: storageConnectionString }
        { name: 'STORAGE_ACCOUNT_NAME', value: storageAccountName }
        { name: 'STORAGE_CONTAINER_COMPLAINTS', value: 'complaint-pdfs' }
        { name: 'STORAGE_CONTAINER_EVIDENCE', value: 'evidence-files' }

        // Microsoft Graph (for email notifications)
        { name: 'GRAPH_CLIENT_ID', value: graphClientId }
        { name: 'GRAPH_CLIENT_SECRET', value: graphClientSecret }
        { name: 'GRAPH_TENANT_ID', value: graphTenantId }
        { name: 'GRAPH_SENDER_EMAIL', value: graphSenderEmail }

        // Orchestration defaults
        { name: 'DEFAULT_ACKNOWLEDGE_DEADLINE_DAYS', value: '7' }
        { name: 'DEFAULT_INQUIRY_DEADLINE_DAYS', value: '90' }
      ]
    }
  }
}

output resourceId string = functionApp.id
output defaultHostName string = functionApp.properties.defaultHostName
output baseUrl string = 'https://${functionApp.properties.defaultHostName}'
output name string = functionApp.name
