@description('Base name used to derive resource names')
param resourceBaseName string
param location string = resourceGroup().location

@description('Blob containers to create. Used for evidence files and complaint PDFs.')
param blobContainerNames array = [
  'evidence-files'
  'complaint-pdfs'
]

// Storage account name: lowercase alphanumeric, max 24 chars
var storageAccountName = toLower(replace('${resourceBaseName}sa', '-', ''))

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: take(storageAccountName, 24)
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true // Needed for Functions runtime + Durable Functions
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

resource containers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = [for name in blobContainerNames: {
  parent: blobService
  name: name
  properties: {
    publicAccess: 'None'
  }
}]

var accountKey = storage.listKeys().keys[0].value

output accountName string = storage.name
output resourceId string = storage.id
#disable-next-line outputs-should-not-contain-secrets
output connectionString string = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${accountKey};EndpointSuffix=${environment().suffixes.storage}'
output blobEndpoint string = storage.properties.primaryEndpoints.blob
