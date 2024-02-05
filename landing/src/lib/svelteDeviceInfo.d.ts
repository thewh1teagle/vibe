interface Device {
    isMobile?: boolean
}
declare module "svelte-device-info" {
    const device: Device;
    export default device;
}