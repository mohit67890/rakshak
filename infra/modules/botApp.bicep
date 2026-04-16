@description('Base name used to derive resource names')
param resourceBaseName string
param location string = resourceGroup().location

@description('App Service Plan SKU for the bot web app')
param webAppSku string = 'B1'

@description('User-assigned managed identity resource ID')
param identityResourceId string

@description('User-assigned managed identity client ID')
param identityClientId string

@description('User-assigned managed identity tenant ID')
param identityTenantId string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Cosmos DB endpoint')
param cosmosEndpoint string

@description('Cosmos DB primary key')
@secure()
param cosmosKey string

@description('Cosmos DB database name')
param cosmosDatabase string

@description('Storage connection string (used for evidence blob access)')
@secure()
param storageConnectionString string

@description('Azure OpenAI endpoint')
param azureOpenAIEndpoint string

@description('Azure OpenAI API key')
@secure()
param azureOpenAIApiKey string

@description('Azure OpenAI deployment name')
param azureOpenAIDeploymentName string

@description('Base URL of the Azure Functions API')
param apiBaseUrl string

var planName = '${resourceBaseName}-plan'
var webAppName = resourceBaseName

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  kind: 'app'
  sku: {
    name: webAppSku
  }
  properties: {}
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  kind: 'app'
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
      alwaysOn: true
      ftpsState: 'FtpsOnly'
      minTlsVersion: '1.2'
      appSettings: [
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~22' }
        { name: 'RUNNING_ON_AZURE', value: '1' }

        // Bot / Entra (managed identity)
        { name: 'CLIENT_ID', value: identityClientId }
        { name: 'TENANT_ID', value: identityTenantId }
        { name: 'BOT_TYPE', value: 'UserAssignedMsi' }

        // Application Insights
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }

        // Cosmos DB
        { name: 'COSMOS_ENDPOINT', value: cosmosEndpoint }
        { name: 'COSMOS_KEY', value: cosmosKey }
        { name: 'COSMOS_DATABASE', value: cosmosDatabase }

        // Azure Blob Storage (evidence + complaint PDFs)
        { name: 'STORAGE_CONNECTION_STRING', value: storageConnectionString }
        { name: 'STORAGE_CONTAINER_COMPLAINTS', value: 'complaint-pdfs' }
        { name: 'STORAGE_CONTAINER_EVIDENCE', value: 'evidence-files' }

        // Azure OpenAI
        { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAIEndpoint }
        { name: 'AZURE_OPENAI_API_KEY', value: azureOpenAIApiKey }
        { name: 'AZURE_OPENAI_DEPLOYMENT_NAME', value: azureOpenAIDeploymentName }

        // Raksha API (Azure Functions) base URL
        { name: 'API_BASE_URL', value: apiBaseUrl }
      ]
    }
  }
}

output resourceId string = webApp.id
output defaultHostName string = webApp.properties.defaultHostName
