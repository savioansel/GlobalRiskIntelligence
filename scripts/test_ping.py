import httpx
import asyncio
import time

async def test():
    async with httpx.AsyncClient() as c:
        await c.post('http://localhost:8000/api/ais/reset')
        time.sleep(1)
        
        await c.post('http://localhost:8000/api/ais/voyage', json={
            'voyage_id':'voy_1234',
            'mmsi':'232000000',
            'vessel_name':'Test',
            'origin':'A',
            'destination':'B',
            'cargo_value_usd':100,
            'policy_id':'POL-1234',
            'declared_route':[]
        })
        
        r1 = await c.post('http://localhost:8000/api/ais/ping', json={
            'mmsi':'232000000',
            'lat':15.0,
            'lon':42.5,
            'speed_kn':14.0,
            'voyage_id':'voy_1234',
            'status':'underway'
        })
        print(r1.json())

if __name__ == '__main__':
    asyncio.run(test())
