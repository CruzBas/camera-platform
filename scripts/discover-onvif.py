#!/usr/bin/env python3
"""
Paso 0.1 del roadmap: encuentra cámaras ONVIF (como la TENVIS) en la red local con WS-Discovery.

    python3 scripts/discover-onvif.py

Muestra la IP y la URL del servicio ONVIF de cada cámara que responda. Con la IP, arma la URL RTSP
(p. ej. rtsp://usuario:contraseña@IP:554/11) y valídala con scripts/probe-camera.sh.
La Mac tiene que estar en la misma red (Wi-Fi/LAN) que la cámara.
"""
import re
import socket
import uuid

MULTICAST = ("239.255.255.250", 3702)
TIMEOUT_S = 3

PROBE = f"""<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:{uuid.uuid4()}</w:MessageID>
    <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body>
</e:Envelope>"""


def main() -> None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    sock.settimeout(TIMEOUT_S)
    sock.sendto(PROBE.encode(), MULTICAST)

    found: dict[str, tuple[str, str]] = {}
    try:
        while True:
            data, (ip, _) = sock.recvfrom(65535)
            body = data.decode(errors="replace")
            xaddrs = re.search(r"<[^>]*XAddrs>([^<]+)<", body)
            scopes = re.search(r"<[^>]*Scopes>([^<]+)<", body)
            names = re.findall(r"onvif://www\.onvif\.org/(?:name|hardware)/([^\s]+)", scopes.group(1) if scopes else "")
            found[ip] = (xaddrs.group(1).split()[0] if xaddrs else "?", " / ".join(names))
    except socket.timeout:
        pass

    if not found:
        print("No respondió ninguna cámara ONVIF. Revisa que la cámara esté encendida, en la misma red "
              "y con ONVIF activado en su configuración.")
        return
    for ip, (xaddr, name) in sorted(found.items()):
        print(f"{ip:<16} {name or 'cámara ONVIF'}\n                 servicio ONVIF: {xaddr}")


if __name__ == "__main__":
    main()
