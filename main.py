from my_math import my_factorial

def main():
    try:
        user_input = input()
        n = int(user_input)
        result = my_factorial(n)
        print(f"{n}! = {result}")
        
    except ValueError as e:
        print(f"Ошибка: {e}")

if __name__ == "__main__":
    main()