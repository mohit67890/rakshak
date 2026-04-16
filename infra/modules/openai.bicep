@description('Base name used to derive resource names')
param resourceBaseName string

@description('Region where Azure OpenAI is deployed. Must support the selected model.')
param location string = resourceGroup().location

@description('Model name to deploy (e.g. gpt-4o, gpt-4o-mini).')
param modelName string = 'gpt-4o-mini'

@description('Model version.')
param modelVersion string = '2024-07-18'

@description('Deployment name used as AZURE_OPENAI_DEPLOYMENT_NAME.')
param deploymentName string = 'gpt-4o-mini'

@description('Deployment capacity (TPM in thousands).')
param capacity int = 30

@description('User-assigned managed identity principal ID granted Cognitive Services User access.')
param identityPrincipalId string

var accountName = toLower('${resourceBaseName}-openai')

resource openai 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: accountName
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: accountName
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: false
  }
}

resource deployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openai
  name: deploymentName
  sku: {
    name: 'GlobalStandard'
    capacity: capacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
    raiPolicyName: 'Microsoft.DefaultV2'
  }
}

// Grant identity "Cognitive Services OpenAI User" role
// Role definition ID: 5e0bd9bd-7b93-4f28-af87-19fc36ad61bd
resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(openai.id, identityPrincipalId, 'openai-user')
  scope: openai
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output endpoint string = openai.properties.endpoint
output accountName string = openai.name
output deploymentName string = deployment.name
#disable-next-line outputs-should-not-contain-secrets
output apiKey string = openai.listKeys().key1
