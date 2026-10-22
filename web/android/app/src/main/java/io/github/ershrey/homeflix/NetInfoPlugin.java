package io.github.ershrey.homeflix;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;

/**
 * Tells the web app this device's local IPv4 address, so it can look for the HomeFlix
 * server on the same network. Reads the network interfaces only: no extra permissions.
 */
@CapacitorPlugin(name = "NetInfo")
public class NetInfoPlugin extends Plugin {

    @PluginMethod
    public void getIPv4(PluginCall call) {
        String best = null;
        try {
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nif.isUp() || nif.isLoopback() || nif.isVirtual()) continue;
                for (InetAddress addr : Collections.list(nif.getInetAddresses())) {
                    if (!(addr instanceof Inet4Address) || !addr.isSiteLocalAddress()) continue;
                    String ip = addr.getHostAddress();
                    // Prefer Wi-Fi / Ethernet over mobile data or VPN interfaces.
                    String name = nif.getName();
                    if (name.startsWith("wlan") || name.startsWith("eth")) {
                        best = ip;
                        break;
                    }
                    if (best == null) best = ip;
                }
                if (best != null && (nif.getName().startsWith("wlan") || nif.getName().startsWith("eth"))) break;
            }
        } catch (Exception e) {
            call.reject("Could not read the network address", e);
            return;
        }
        JSObject result = new JSObject();
        result.put("ip", best);
        call.resolve(result);
    }
}
