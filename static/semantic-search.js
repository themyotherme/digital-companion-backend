// Semantic Search Module
class SemanticSearch {
  constructor() {
    this.model = null;
    this.embeddings = new Map();
    this.isModelLoaded = false;
    this.loadingPromise = null;
    this.progressCallback = null;
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  updateProgress(status, percentage, details = '') {
    if (this.progressCallback) {
      this.progressCallback(status, percentage, details);
    }
  }

  async initialize() {
    if (this.loadingPromise) return this.loadingPromise;
    
    this.loadingPromise = (async () => {
      try {
        this.updateProgress('Loading TensorFlow.js...', 10);
        await tf.ready();
        
        this.updateProgress('Loading Universal Sentence Encoder...', 50);
        this.model = await use.load();
        this.isModelLoaded = true;
        
        this.updateProgress('Loading saved documents...', 80);
        await this.loadFromIndexedDB();
        
        this.updateProgress('Ready', 100);
        console.log('Semantic search model loaded successfully');
      } catch (error) {
        console.error('Failed to load semantic search model:', error);
        this.updateProgress('Error loading model', 0, error.message);
        throw error;
      }
    })();
    
    return this.loadingPromise;
  }

  async processBatch(documents, options = {}) {
    const {
      chunkSize = 1000,
      overlap = 100,
      onProgress = null
    } = options;

    const totalDocs = documents.length;
    let processedDocs = 0;

    for (const doc of documents) {
      try {
        // Split document into chunks
        const chunks = this.splitIntoChunks(doc.text, chunkSize, overlap);
        const totalChunks = chunks.length;
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const chunkId = `${doc.id}-chunk-${i}`;
          
          await this.addDocument(chunkId, chunk, {
            ...doc.metadata,
            chunkIndex: i,
            totalChunks,
            originalId: doc.id
          });

          // Update progress
          const progress = ((processedDocs + (i + 1) / totalChunks) / totalDocs) * 100;
          this.updateProgress(
            `Processing ${doc.metadata.filename || 'document'} (${i + 1}/${totalChunks} chunks)`,
            progress
          );
        }
        
        processedDocs++;
      } catch (error) {
        console.error(`Error processing document ${doc.id}:`, error);
        this.updateProgress(
          'Error',
          (processedDocs / totalDocs) * 100,
          `Failed to process document: ${error.message}`
        );
      }
    }

    return {
      success: processedDocs === totalDocs,
      processed: processedDocs,
      total: totalDocs
    };
  }

  splitIntoChunks(text, chunkSize, overlap) {
    const chunks = [];
    let start = 0;
    
    while (start < text.length) {
      let end = start + chunkSize;
      
      // If not at the end, try to find a good break point
      if (end < text.length) {
        // Look for sentence end
        const nextPeriod = text.indexOf('.', end - overlap);
        const nextNewline = text.indexOf('\n', end - overlap);
        
        if (nextPeriod !== -1 && nextPeriod < end + overlap) {
          end = nextPeriod + 1;
        } else if (nextNewline !== -1 && nextNewline < end + overlap) {
          end = nextNewline + 1;
        }
      }
      
      chunks.push(text.slice(start, end).trim());
      start = end - overlap;
    }
    
    return chunks;
  }

  async getDocumentInfo() {
    const documents = new Map();
    
    for (const [id, data] of this.embeddings) {
      const originalId = data.metadata.originalId || id;
      if (!documents.has(originalId)) {
        documents.set(originalId, {
          id: originalId,
          title: data.metadata.filename || 'Untitled Document',
          chunks: 0,
          lastUpdated: data.metadata.timestamp || Date.now(),
          metadata: data.metadata
        });
      }
      documents.get(originalId).chunks++;
    }
    
    return Array.from(documents.values());
  }

  async searchDocuments(query, options = {}) {
    const {
      topK = 5,
      minScore = 0.5,
      groupByDocument = true
    } = options;

    const results = await this.search(query, topK * 2); // Get more results for grouping
    
    if (groupByDocument) {
      const groupedResults = new Map();
      
      for (const result of results) {
        const docId = result.metadata.originalId || result.id.split('-chunk-')[0];
        if (!groupedResults.has(docId)) {
          groupedResults.set(docId, {
            id: docId,
            title: result.metadata.filename || 'Untitled Document',
            score: result.score,
            chunks: []
          });
        }
        
        if (result.score >= minScore) {
          groupedResults.get(docId).chunks.push({
            text: result.text,
            score: result.score,
            metadata: result.metadata
          });
        }
      }
      
      // Sort by average score and take top K
      return Array.from(groupedResults.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    }
    
    return results.filter(r => r.score >= minScore).slice(0, topK);
  }

  async getEmbedding(text) {
    if (!this.isModelLoaded) {
      await this.initialize();
    }
    
    try {
      const embedding = await this.model.embed(text);
      return await embedding.array();
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  async addDocument(id, text, metadata = {}) {
    try {
      const embedding = await this.getEmbedding(text);
      this.embeddings.set(id, {
        embedding,
        text,
        metadata
      });
      
      // Save to IndexedDB
      await this.saveToIndexedDB(id, {
        embedding,
        text,
        metadata
      });
      
      return true;
    } catch (error) {
      console.error('Error adding document:', error);
      return false;
    }
  }

  async search(query, topK = 5) {
    if (!this.isModelLoaded) {
      await this.initialize();
    }

    try {
      const queryEmbedding = await this.getEmbedding(query);
      const results = [];

      for (const [id, doc] of this.embeddings) {
        const similarity = this.cosineSimilarity(queryEmbedding, doc.embedding);
        results.push({
          id,
          text: doc.text,
          metadata: doc.metadata,
          score: similarity
        });
      }

      // Sort by similarity score and return top K results
      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    } catch (error) {
      console.error('Error performing semantic search:', error);
      throw error;
    }
  }

  cosineSimilarity(a, b) {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  async saveToIndexedDB(id, data) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('SemanticSearchDB', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('embeddings')) {
          db.createObjectStore('embeddings');
        }
      };
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['embeddings'], 'readwrite');
        const store = transaction.objectStore('embeddings');
        
        const saveRequest = store.put(data, id);
        saveRequest.onsuccess = () => resolve();
        saveRequest.onerror = () => reject(saveRequest.error);
      };
    });
  }

  async loadFromIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('SemanticSearchDB', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['embeddings'], 'readonly');
        const store = transaction.objectStore('embeddings');
        const getAllRequest = store.getAll();
        
        getAllRequest.onsuccess = () => {
          const results = getAllRequest.result;
          results.forEach((data, index) => {
            this.embeddings.set(index.toString(), data);
          });
          resolve();
        };
        
        getAllRequest.onerror = () => reject(getAllRequest.error);
      };
    });
  }

  async removeDocument(id) {
    this.embeddings.delete(id);
    // Remove from IndexedDB
    const request = indexedDB.open('SemanticSearchDB', 1);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['embeddings'], 'readwrite');
      const store = transaction.objectStore('embeddings');
      store.delete(id);
    };
  }
}

// Export the module
window.SemanticSearch = SemanticSearch; 