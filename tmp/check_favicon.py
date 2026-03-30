import requests, hashlib
url = "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.completelyfakedomain1234.com&size=256"
b = requests.get(url).content
print("Fake domain globe hash:", hashlib.md5(b).hexdigest(), "size:", len(b))

url2 = "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://theborgata.com&size=256"
b2 = requests.get(url2).content
print("Borgata size:", len(b2), "hash:", hashlib.md5(b2).hexdigest())
