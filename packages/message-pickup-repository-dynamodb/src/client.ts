import { 
    DynamoDBClient, 
    QueryCommand, 
    QueryCommandInput, 
    PutItemCommand, 
    PutItemCommandInput,
    DeleteItemCommand, 
    DeleteItemCommandInput,
    ScanCommand,
    ScanCommandInput,
    CreateTableCommand,
    CreateTableCommandInput,
    DescribeTableCommand,
    DescribeTableCommandInput,
    AttributeDefinition,
    KeySchemaElement,
    ProvisionedThroughput,
    DynamoDBClientConfigType
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

// Interfaces
export interface EncryptedMessage {
    protected: string;
    iv: string;
    ciphertext: string;
    tag: string;
}

export interface QueuedMessage {
    id: string;
    connection_id: string;
    state: string;
    receivedAt?: Date;
    encryptedMessage: EncryptedMessage;
    recipientDid?: string;
}

export interface AddMessageOptions {
    connectionId: string;
    messageId: string
    recipientDids: string[];
    payload: EncryptedMessage;
}

export interface RemoveMessagesOptions {
    connectionId: string;
    messageIds: string[];
}

export class QueuedMessagesService {
    // Private property for DynamoDB client
    private dynamodbClient: DynamoDBClient;
    private tableName: string = 'queued_messages';

    private constructor(options: DynamoDBClientConfigType) {
        // Initialize DynamoDB client 
        this.dynamodbClient = new DynamoDBClient(options);
    }

    /**
     * Create the DynamoDB table for queued messages
     * @param options Optional configuration for table creation
     * @returns Promise resolving when table is created
     */
    public static async initialize(cOps: DynamoDBClientConfigType, options: {
        readCapacityUnits?: number,
        writeCapacityUnits?: number,
        waitForTableToExist?: boolean
    } = {}): Promise<QueuedMessagesService> {
      const qms = new QueuedMessagesService(cOps)
        const { 
            readCapacityUnits = 5, 
            writeCapacityUnits = 5,
            waitForTableToExist = true
        } = options;

        // Define table attributes
        const attributeDefinitions: AttributeDefinition[] = [
            {
                AttributeName: 'connection_id',
                AttributeType: 'S'
            },
            {
                AttributeName: 'id',
                AttributeType: 'S'
            }
        ];

        // Define key schema
        const keySchema: KeySchemaElement[] = [
            {
                AttributeName: 'connection_id',
                KeyType: 'HASH'  // Partition key
            },
            {
                AttributeName: 'id',
                KeyType: 'RANGE'  // Sort key
            }
        ];

        // Prepare create table parameters
        const params: CreateTableCommandInput = {
            TableName: qms.tableName,
            AttributeDefinitions: attributeDefinitions,
            KeySchema: keySchema,
            ProvisionedThroughput: {
                ReadCapacityUnits: readCapacityUnits,
                WriteCapacityUnits: writeCapacityUnits
            }
        };

        try {
            // Create table
            const command = new CreateTableCommand(params);
            const response = await qms.dynamodbClient.send(command);

            // Optionally wait for table to exist
            if (waitForTableToExist) {
                await qms.waitForTableToExist();
            }

            console.log(`Table ${qms.tableName} created successfully`);
        } catch (error) {
            // Check if table already exists
            if (error instanceof Error && error.name === 'ResourceInUseException') {
              return qms
            }
        }

        return qms
    }

    /**
     * Wait for the table to become active
     * @returns Promise resolving when table is active
     */
    private async waitForTableToExist(maxWaitTime = 300000): Promise<void> {
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const checkTableStatus = async () => {
                try {
                    const describeParams: DescribeTableCommandInput = {
                        TableName: this.tableName
                    };
                    const command = new DescribeTableCommand(describeParams);
                    const response = await this.dynamodbClient.send(command);

                    if (response.Table?.TableStatus === 'ACTIVE') {
                        resolve();
                        return;
                    }

                    // Check if we've exceeded max wait time
                    if (Date.now() - startTime > maxWaitTime) {
                        reject(new Error(`Table ${this.tableName} did not become active within ${maxWaitTime}ms`));
                        return;
                    }

                    // Wait and check again
                    setTimeout(checkTableStatus, 1000);
                } catch (error) {
                    reject(error);
                }
            };

            checkTableStatus();
        });
    }

    /**
     * Get the count of entries for a specific connection ID
     * @param connectionId The connection ID to query
     * @returns Promise with the count of entries
     */
    async getEntriesCount(connectionId: string): Promise<number> {
        const params: ScanCommandInput = {
            TableName: this.tableName,
            FilterExpression: 'connection_id = :connectionId',
            ExpressionAttributeValues: {
                ':connectionId': { S: connectionId }
            },
            Select: 'COUNT'
        };

        try {
            const command = new ScanCommand(params);
            const response = await this.dynamodbClient.send(command);
            return response.Count || 0;
        } catch (error) {
            console.error('Error getting entries count:', error);
            throw error;
        }
    }

    /**
     * Get entries for a specific connection ID with optional filters
     * @param connectionId The connection ID to query
     * @param options Optional parameters for filtering and deleting
     * @returns Promise with array of queued messages
     */
    async getEntries(
        connectionId: string, 
        options: {
            limit?: number, 
            recipientDid?: string, 
            deleteMessages?: boolean 
        } = {}
    ): Promise<QueuedMessage[]> {
        const { limit, recipientDid, deleteMessages = false } = options;

        // Prepare query parameters
        const queryParams: QueryCommandInput = {
            TableName: this.tableName,
            KeyConditionExpression: 'connection_id = :connectionId',
            ExpressionAttributeValues: {
                ':connectionId': { S: connectionId }
            },
            Limit: limit
        };

        // Add optional recipient filter if provided
        if (recipientDid) {
            queryParams.FilterExpression = 'recipientDid = :recipientDid';
            queryParams.ExpressionAttributeValues![':recipientDid'] = { S: recipientDid };
        }

        try {
            // Execute query
            const command = new QueryCommand(queryParams);
            const response = await this.dynamodbClient.send(command);

            // Transform DynamoDB items to QueuedMessage
            const messages = response.Items?.map(item => 
                unmarshall(item) as QueuedMessage
            ) || [];

            // Delete messages if option is true
            if (deleteMessages && messages.length > 0) {
                await Promise.all(messages.map(msg => 
                    this.removeMessages({
                        connectionId, 
                        messageIds: [msg.id]
                    })
                ));
            }

            return messages;
        } catch (error) {
            console.error('Error getting entries:', error);
            throw error;
        }
    }

    /**
     * Add a new message to the queue
     * @param options Message addition options
     */
    async addMessage(options: AddMessageOptions): Promise<void> {

        // Prepare batch write for multiple recipient DIDs
        const writeRequests = options.recipientDids.map(recipientDid => {
            const itemParams: PutItemCommandInput = {
                TableName: this.tableName,
                Item: marshall({
                    id: options.messageId,
                    connection_id: options.connectionId,
                    state: 'queued',
                    receivedAt: new Date().toISOString(),
                    encryptedMessage: options.payload,
                    recipientDid
                })
            };

            return this.dynamodbClient.send(new PutItemCommand(itemParams));
        });

        try {
            // Execute all write requests
            await Promise.all(writeRequests);
        } catch (error) {
            console.error('Error adding message:', error);
            throw error;
        }
    }

    /**
     * Remove specific messages
     * @param options Remove messages options
     */
    async removeMessages(options: RemoveMessagesOptions): Promise<void> {
        // Prepare batch delete requests
        const deleteRequests = options.messageIds.map(messageId => {
            const deleteParams: DeleteItemCommandInput = {
                TableName: this.tableName,
                Key: marshall({
                    connection_id: options.connectionId,
                    id: messageId
                })
            };

            return this.dynamodbClient.send(new DeleteItemCommand(deleteParams));
        });

        try {
            // Execute all delete requests
            await Promise.all(deleteRequests);
        } catch (error) {
            console.error('Error removing messages:', error);
            throw error;
        }
    }
}
