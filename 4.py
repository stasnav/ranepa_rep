def my_factorial(n):
    if n < 0:
        raise ValueError("Факториал определен только для неотрицательных целых чисел")
    
    if n == 0 or n == 1:
        return 1
    
    result = 1
    for i in range(2, n + 1):
        result *= i
    
    return result


try:
    n = int(input())
    result = my_factorial(n)
    print(f"{n}! = {result}")
except ValueError as e:
    print(f"Ошибка: {e}")
