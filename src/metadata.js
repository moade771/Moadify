const fs = require('fs');

async function parseFile(filePath) {
    try {
        const mm = await import('music-metadata');
        const metadata = await mm.parseFile(filePath);

        // Extract cover art if available
        let cover = null;
        if (metadata.common.picture && metadata.common.picture.length > 0) {
            const picture = metadata.common.picture[0];
            cover = `data:${picture.format};base64,${picture.data.toString('base64')}`;
        }

        return {
            title: metadata.common.title || 'Unknown Title',
            artist: metadata.common.artist || 'Unknown Artist',
            album: metadata.common.album || 'Unknown Album',
            duration: metadata.format.duration || 0,
            cover: cover
        };
    } catch (error) {
        console.error('Error parsing file:', filePath, error);
        return null;
    }
}

module.exports = { parseFile };
