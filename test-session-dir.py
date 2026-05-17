from scrapling.fetchers import StealthySession

def test():
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    try:
        print("StealthySession properties and methods:")
        print(dir(session))
    finally:
        session.close()

if __name__ == "__main__":
    test()
