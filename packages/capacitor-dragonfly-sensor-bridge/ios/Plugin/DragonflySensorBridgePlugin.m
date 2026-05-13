#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Capacitor's Objective-C macros register the Swift plugin so the
// JS bridge can find it under window.Capacitor.Plugins.DragonflySensorBridge.
CAP_PLUGIN(DragonflySensorBridgePlugin, "DragonflySensorBridge",
    CAP_PLUGIN_METHOD(installToken, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(clearToken,   CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getStatus,    CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(emitDemoReading, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(readLibreOnce,   CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(readDexcomG6Once, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(readDexcomG7Once, CAPPluginReturnPromise);
)
