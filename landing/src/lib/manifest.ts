interface Platform {
    signature: string,
    url: string
}

interface Manifest {
    version: string;
    notes: string,
    pub_date: string,
    platforms: {
        'darwin-aarch64'?: Platform,
        'darwin-x86_64': Platform
        'windows-x86_64': Platform,        
    }
}
  
declare module "$lib/manifest.json" {
    const manifest: Manifest;
    export default manifest;
}