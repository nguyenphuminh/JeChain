# RPC APIs

## What are JeChain RPC APIs?

RPC APIs are APIs provided by running a JeChain RPC server. They can be used by apps or additional tools to interact with the node, thus also getting access to the network, being able to send transactions from the app and getting the pieces of blockchain data like blocks, account balance and more.


## APIs

### GET

* `/get_blockNumber`:
    * Use case: Get the latest block number.
    * Reply body: `{ success: true, payload: { blockNumber: <block_number> } }`

* `/get_address`:
    * Use case: Get the client's JeChain address from the RPC server.
    * Reply body: `{ success: true, payload: { address: <address> } }`
 
* `/get_pubkey`:
    * Use case: Get the client's JeChain pubkey from the RPC server.
    * Reply body: `{ success: true, payload: { pubkey: <address> } }`

* `/get_work`:
    * Use case: Get hash and nonce from the latest block.
    * Reply body: `{ success: true, payload: { hash: <hash>, nonce: <nonce> } }`

* `/mining`:
    * Use case: Check on whether client is mining or not.
    * Reply body: `{ success: true, payload: { mining: true | false } }`

### POST

* `/get_blockByHash`:
    * Use case: Get block by hash.
    * Request body: `{ params: { hash: <hash> } }`
    * Reply body: `{ success: true, payload: { block: <block> } }`
    * Error body:
        * Invalid request (not enough params):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid request." } }`
        * Invalid block hash (block with given hash not found):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid block hash." } }`

* `/get_blockByNumber`:
    * Use case: Get block by block number.
    * Request body: `{ params: { blockNumber: <block_number> } }`
    * Reply body: `{ success: true, payload: { block: <block> } }`
    * Error body:
        * Invalid request (not enough params):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid request." } }`
        * Invalid block number (block with given number not found):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid block number." } }`

* `/get_blockTransactionCountByHash`:
    * Use case: Get transaction count from block through block hash.
    * Request body: `{ params: { hash: <hash> } }`
    * Reply body: `{ success: true, payload: { count: <count> } }`
    * Error body:
        * Invalid request (not enough params):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid request." } }`
        * Invalid block hash (block with given hash not found):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid block hash." } }`

* `/get_blockTransactionCountByNumber`:
    * Use case: Get transaction count from block through block number.
    * Request body: `{ params: { blockNumber: <block_number> } }`
    * Reply body: `{ success: true, payload: { count: <count> } }`
    * Error body:
        * Invalid request (not enough params):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid request." } }`
        * Invalid block number (block with given number not found):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid block number." } }`

* `/get_balance`:
    * Use case: Get balance from address.
    * Request body: `{ params: { address: <address> } }`
    * Reply body: `{ success: true, payload: { balance: <balance> } }`
    * Error body:
        * Invalid request (not enough params):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid request." } }`

* `/get_nonce`:
    * Use case: Get nonce from address.
    * Request body: `{ params: { address: <address> } }`
    * Reply body: `{ success: true, payload: { nonce: <nonce> } }`
    * Error body:
        * Invalid request (not enough params):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid request." } }`

* `/get_code`:
    * Use case: Get code from code hash.
    * Request body: `{ params: { codeHash: <code_hash_as_hexstring> } }`
    * Reply body: `{ success: true, payload: { code: <code> } }`
    * Error body:
        * Invalid request (not enough params):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid request." } }`
         
* `/get_codeHash`:
    * Use case: Get code hash from address.
    * Request body: `{ params: { address: <address> } }`
    * Reply body: `{ success: true, payload: { codeHash: <code_hash_as_hexstring> } }`
    * Error body:
        * Invalid request (not enough params):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid request." } }`

* `/get_storage`:
    * Use case: Get the storage object from address.
    * Request body: `{ params: { address: <address> } }`
    * Reply body: `{ success: true, payload: { storage: <storage_object> } }`
    * Error body:
        * Invalid request (not enough params):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid request." } }`

* `/sendTransaction`:
    * Use case: Send transaction.
    * Request body: `{ params: { transaction: <transaction_object> } }`
    * Reply body: `{ success: true, payload: { message: "tx received." } }`
    * Error body:
        * Invalid request (not enough params):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid request." } }`
         
* `/signTransaction`:
    * Use case: Sign transaction.
    * Request body: `{ params: { transaction: <transaction_object> } }`
    * Reply body: `{ success: true, payload: { transaction: <transaction_object> } }`
    * Error body:
        * Invalid request (not enough params):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid request." } }`
         
* `/serializeTransaction`:
    * Use case: Serialize transaction.
    * Request body: `{ params: { transaction: <transaction_object> } }`
    * Reply body: `{ success: true, payload: { transaction: <transaction_bytearray> } }`
    * Error body:
        * Invalid request (not enough params):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid request." } }`
         
* `/deserializeTransaction`:
    * Use case: Deserialize transaction.
    * Request body: `{ params: { transaction: <transaction_bytearray> } }`
    * Reply body: `{ success: true, payload: { transaction: <transaction_object> } }`
    * Error body:
        * Invalid request (not enough params):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid request." } }`

* `/get_transactionByBlockHashAndIndex`:
    * Use case: Get transaction through block hash and transaction index.
    * Request body: `{ params: { hash: <hash>, index: <index> } }`
    * Reply body: `{ success: true, payload: { transaction: <transaction_object> } }`
    * Error body:
        * Invalid request (not enough params):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid request." } }`
        * Invalid block hash (block with given hash not found):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid block hash." } }`
        * Invalid transaction index (transaction with index given not found):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid transaction index." } }`

* `/get_transactionByBlockNumberAndIndex`:
    * Use case: Get transaction through block number and transaction index.
    * Request body: `{ params: { blockNumber: <block_number>, index: <index> } }`
    * Reply body: `{ success: true, payload: { transaction: <transaction_object> } }`
    * Error body:
        * Invalid request (not enough params):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid request." } }`
        * Invalid block number (block with given number not found):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid block number." } }`
        * Invalid transaction index (transaction with index given not found):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid transaction index." } }`

* `/get_transactionByTxHash`:
    * Use case: Get transaction through its hash.
    * Request body: `{ params: { hash: <tx_hash_hex_string> } }`
    * Reply body: `{ success: true, payload: { transaction: <transaction_object> } }`
    * Error body:
        * Invalid request (not enough params):
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Invalid request." } }`
        * Failed to get transaction with the given hash:
            * Status: 400
            * Body: `{ success: false, payload: null, error: { message: "Failed to get transaction with the given hash." } }`

### Other errors

* Invalid option (non-existent API):
    * Status: 404
    * Body: `{ success: false, payload: null, error: { message: "Invalid option." } }`
