import hashlib
import socket
import sys

ip, port, user, pwd = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
path = sys.argv[5] if len(sys.argv) > 5 else ""
url = f"rtsp://{ip}:{port}{path}"

def send(sock, req):
    sock.sendall(req.encode())
    return sock.recv(4096).decode(errors="replace")

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
s.connect((ip, port))

# 1) Auth so'ramasdan DESCRIBE - 401 + nonce olish uchun
resp1 = send(s, f"DESCRIBE {url} RTSP/1.0\r\nCSeq: 1\r\nAccept: application/sdp\r\n\r\n")
print("--- 1-javob (challenge) ---")
print(resp1)

realm = nonce = None
for line in resp1.splitlines():
    if line.startswith("WWW-Authenticate:"):
        for part in line.split(","):
            if "realm=" in part:
                realm = part.split('realm="')[1].split('"')[0]
            if "nonce=" in part:
                nonce = part.split('nonce="')[1].split('"')[0]

if not (realm and nonce):
    print("[XATO] realm/nonce topilmadi")
    sys.exit(1)

ha1 = hashlib.md5(f"{user}:{realm}:{pwd}".encode()).hexdigest()
ha2 = hashlib.md5(f"DESCRIBE:{url}".encode()).hexdigest()
response = hashlib.md5(f"{ha1}:{nonce}:{ha2}".encode()).hexdigest()

auth_header = (
    f'Digest username="{user}", realm="{realm}", nonce="{nonce}", '
    f'uri="{url}", response="{response}"'
)

s2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s2.settimeout(5)
s2.connect((ip, port))
resp2 = send(s2, f"DESCRIBE {url} RTSP/1.0\r\nCSeq: 2\r\nAccept: application/sdp\r\nAuthorization: {auth_header}\r\n\r\n")
print("--- 2-javob (digest response bilan) ---")
print(resp2[:1500])
