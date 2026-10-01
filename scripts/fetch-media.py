"""Downloads the curated Unsplash photography used by the seed catalogue (Unsplash License)."""
import os, sys, urllib.request, concurrent.futures as cf
MEDIA = {
 # products
 "p/red-roses":"1494972308805-463bc619d34e","p/peony":"1527061011665-3652c757a4d4","p/tulip-vase":"1561181286-d3fee7d55364",
 "p/sunflowers":"1455659817273-f96807779a8a","p/heart-bouquet":"1526047932273-341f2a7631f9","p/single-rose":"1518895949257-7621c3c786d7",
 "p/celebration-box":"1549465220-1a8b9238cd48","p/kraft-box":"1513201099705-a9746e1e201f","p/chocolates":"1481391319762-47dff72954d9",
 "p/truffles":"1549007994-cb92caebd54b","p/fruit-basket":"1606787366850-de6330128bfc","p/coffee-box":"1495474472287-4d71bcdd2085",
 "p/tea-set":"1571934811356-5cc061b6821f","p/choc-cake":"1578985545062-69928b1d9587","p/rainbow-cake":"1464349095431-e9a21285b5f3",
 "p/cupcakes":"1563729784474-d77dbb933a9e","p/bread":"1509440159596-0249088772ff","p/candle":"1602874801007-bd458bb1b8b6",
 "p/pillow":"1584100936595-c0654b55a2e2","p/mug":"1514228742587-6b1558fcca3d","p/boss-mug":"1484981138541-3d074aa97716",
 "p/knit-throw":"1517677208171-0bc6725a3e60","p/pendant":"1599643478518-a784e5dc4c8f","p/pearls":"1515562141207-7a88fb7ce338",
 "p/earrings":"1535632066927-ab7c9ab60908","p/rings":"1606800052052-a08af7148866","p/watch":"1524805444758-089113d48a6d",
 "p/blender":"1585515320310-259814833e62","p/espresso":"1570222094114-d054a817e56b","p/cookware":"1556911220-bff31c812dba",
 "p/barista-cups":"1509042239860-f550ce710b93","p/swaddle":"1555252333-9f8e92e65df9","p/toys":"1515488042361-ee00e0ddd4e4",
 "p/baby-towel":"1566004100631-35d015d6a491","p/succulent":"1485955900006-10f4d324d411","p/cactus":"1459411552884-841db9b3cc2a",
 "p/cactus-trio":"1463936575829-25148e1db1b8","p/notebook":"1531346878377-a5be20888e57","p/books":"1513475382585-d06e58bcb0e0",
 "p/face-oil":"1617897903246-719242758050","p/serum":"1608571423902-eed4a5ad8108","p/ritual-kit":"1612817288484-6f916006741a",
 "p/aroma-oil":"1515377905703-c4788e51af15","p/red-bag":"1584917865442-de89df76afd3","p/leather-backpack":"1622560480605-d83c853bc5c3",
 "p/tote":"1544816155-12df9643f363","p/headphones":"1505740420928-5e560c06d30e","p/tea-cup":"1544787219-7f47ccb76574",
 # vendor covers
 "v/flower-shop":"1487070183336-b863922373d4","v/gifts-dark":"1608755728617-aefab37d2edd","v/baking":"1506368083636-6defb67639a7",
 "v/living-room":"1586023492125-27b2c045efd7","v/kitchen":"1556911220-bff31c812dba","v/baby":"1519689680058-324335c77eba",
 "v/garden":"1416879595882-3373a0480b5b","v/library":"1507842217343-583bb7270b66","v/backpack":"1553062407-98eeb64c6a62",
 "v/serum":"1608571423902-eed4a5ad8108","v/jewellery":"1599643478518-a784e5dc4c8f",
 # occasions
 "occasions/birthday":"1530103862676-de8c9debad1d","occasions/wedding":"1606216794074-735e91aa2c92","occasions/anniversary":"1606800052052-a08af7148866",
 "occasions/baby":"1555252333-9f8e92e65df9","occasions/graduation":"1627556704302-624286467c65","occasions/housewarming":"1616486338812-3dadae4b4ace",
 "occasions/appreciation":"1512909006721-3d6018887383","occasions/get-well":"1520763185298-1b434c919102","occasions/just-because":"1549465220-1a8b9238cd48",
 "occasions/sympathy":"1518895949257-7621c3c786d7",
 # editorial
 "e/hero-gifts":"1513885535751-8b9238bd345a","e/gift-pattern":"1607344645866-009c320b63e0","e/portrait-ada":"1531123897727-8f129e1688ce",
 "e/portrait-man":"1516914943479-89db7d9ae7f2","e/portrait-woman":"1545912452-8aea7e25a3d3","e/dinner":"1527529482837-4698179dc6ce",
 "e/friends":"1592861956120-e524fc739696","e/confetti":"1513151233558-d860c5398176","e/venue":"1510076857177-7470076d4098",
 "e/wedding-table":"1519225421980-715cb0215aed","e/bride":"1519741497674-611481863552","e/house":"1600585154340-be6161a56a0c",
 "e/hands-gift":"1512909006721-3d6018887383","e/wedding-chairs":"1522673607200-164d1b6ce486","e/balloons":"1530103862676-de8c9debad1d",
 "e/smile":"1530021232320-687d8e3dba54","e/baby-blanket":"1566004100631-35d015d6a491",
}
root = sys.argv[1]
def get(item):
    key, pid = item
    out=[]
    for w, suffix in ((640, ""), (1400, "@2x")):
        path = os.path.join(root, f"{key}{suffix}.webp")
        if os.path.exists(path): continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        url = f"https://images.unsplash.com/photo-{pid}?w={w}&q=72&fm=webp&fit=max"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=40).read()
        open(path, "wb").write(data); out.append(len(data))
    return key, sum(out)
with cf.ThreadPoolExecutor(12) as ex:
    total = sum(n for _, n in ex.map(get, MEDIA.items()))
print("files:", len(MEDIA)*2, "bytes:", total)
