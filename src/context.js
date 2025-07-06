const fs = require("fs");
const path = require("path");
const os = require("os");

const configDir = path.join(os.homedir(), ".ai-cli");
const contextDir = path.join(configDir, "contexts");

// Context management functions
async function saveContext(name, messages) {
  try {
    if (!fs.existsSync(contextDir)) {
      fs.mkdirSync(contextDir, { recursive: true });
    }
    
    const contextFile = path.join(contextDir, `${name}.json`);
    const context = {
      name,
      messages,
      createdAt: fs.existsSync(contextFile) 
        ? JSON.parse(fs.readFileSync(contextFile, 'utf8')).createdAt 
        : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(contextFile, JSON.stringify(context, null, 2));
    return true;
  } catch (error) {
    console.error("Error saving context:", error.message);
    return false;
  }
}

async function loadContext(name) {
  try {
    const contextFile = path.join(contextDir, `${name}.json`);
    if (fs.existsSync(contextFile)) {
      return JSON.parse(fs.readFileSync(contextFile, 'utf8'));
    }
  } catch (error) {
    console.error("Error loading context:", error.message);
  }
  return null;
}

async function listContexts() {
  try {
    if (!fs.existsSync(contextDir)) {
      return [];
    }
    
    const files = fs.readdirSync(contextDir).filter(f => f.endsWith('.json'));
    const contexts = [];
    
    for (const file of files) {
      const contextFile = path.join(contextDir, file);
      const context = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
      contexts.push({
        name: context.name,
        messageCount: context.messages.length,
        lastUpdated: context.updatedAt,
        created: context.createdAt
      });
    }
    
    return contexts.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
  } catch (error) {
    console.error("Error listing contexts:", error.message);
    return [];
  }
}

async function deleteContext(name) {
  try {
    const contextFile = path.join(contextDir, `${name}.json`);
    if (fs.existsSync(contextFile)) {
      fs.unlinkSync(contextFile);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error deleting context:", error.message);
    return false;
  }
}

module.exports = {
  saveContext,
  loadContext,
  listContexts,
  deleteContext,
  contextDir,
};
