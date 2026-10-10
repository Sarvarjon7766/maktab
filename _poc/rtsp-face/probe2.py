import socket
import sys

ip, port = sys.argv[1], int(sys.argv[2])
path = sys.argv[3] if len(sys.argv) > 3 else ""

req = (
    f"DESCRIBE rtsp://{ip}:{port}{path} RTSP/1.0\r\n"
    f"CSeq: 2\r\n"
    f"Accept: application/sdp\r\n"
    f"User-Agent: probe\r\n"
    f"\r\n"
)

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
s.connect((ip, port))
s.sendall(req.encode())
try:
    data = s.recv(4096)
    print(data.decode(errors="replace"))
except socket.timeout:
    print("[XATO] Javob kutish vaqti tugadi (timeout)")
s.close()
